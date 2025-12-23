# Visual Sandbox

The Sandbox is ModEx's interactive graph visualization feature, offering a unique way to explore your mod library.

## Visualization Technology

The Sandbox uses two rendering engines:

### D3.js (SVG Mode)

- Vector-based rendering
- Crisp text and icons at any zoom
- Better for detailed inspection
- Best for libraries under 300 nodes

### PixiJS (WebGL Mode)

- GPU-accelerated rendering
- Handles thousands of nodes
- Smooth 60fps animations
- Best for large libraries

Switch between modes in the toolbar based on your library size.

## Force-Directed Layout

The graph uses force simulation where:

1. **Repulsion** — Nodes push away from each other
2. **Attraction** — Connected nodes pull together
3. **Centering** — The graph centers itself
4. **Collision** — Nodes don't overlap

The result is an organic layout that reveals structure.

## What You'll See

### Nodes

Each node represents:
- **Mods** (green) — Individual mods in your library
- **Folders** (amber) — Your folder organization
- **Resource Packs** (blue) — Resource packs
- **Shaders** (purple) — Shader packs
- **Modpacks** (violet) — Your modpacks

### Connections

Lines between nodes show relationships:
- Mod → Folder (mod is in this folder)
- Mod → Modpack (mod is in this modpack)
- Folder → Folder (nested folders)

## Interactive Features

### Exploration

- **Pan** — Drag empty space
- **Zoom** — Mouse wheel
- **Select** — Click any node
- **Focus** — Double-click to center

### Search

1. Type in the search bar
2. Matching nodes highlight
3. Click result to navigate
4. Non-matches fade out

### Filtering

Toggle node types to focus on:
- Just mods and modpacks
- Only folder structure
- Specific content types

## Performance Optimization

### Performance Mode

Enable for large libraries:
- Simplified node rendering
- Reduced visual effects
- Faster physics calculation

### Node Limits

Very large libraries (1000+ mods) work best with:
- WebGL mode enabled
- Performance mode on
- Aggressive filtering

## Insights from Visualization

### Library Structure

See at a glance:
- How mods cluster by folder
- Which modpacks overlap
- Organizational gaps

### Orphan Detection

Isolated nodes (no connections) indicate:
- Mods in no folder
- Mods in no modpack
- Potential cleanup candidates

### Hub Mods

Highly connected nodes are your most-used mods — core dependencies appearing in many modpacks.

## Technical Details

The visualization is built with:
- **D3-force** for physics simulation
- **PixiJS** for WebGL rendering
- **Vue 3** for reactive updates
