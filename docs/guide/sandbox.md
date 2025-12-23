# Sandbox

The Sandbox is an interactive graph visualization of your mod library and modpacks. It provides a unique way to explore relationships and connections between your content.

## Overview

The Sandbox renders your library as a **force-directed graph** where:
- **Nodes** represent mods, folders, and modpacks
- **Edges** show relationships (mod in folder, mod in modpack)
- **Physics simulation** arranges nodes naturally

## Rendering Modes

Choose between two rendering engines:

### SVG Mode

- Higher visual quality
- Smooth text and icons
- Best for smaller libraries
- Click the **SVG** button in toolbar

### WebGL Mode

- Better performance
- Handles large libraries smoothly
- Uses PixiJS for GPU acceleration
- Click the **WebGL** button in toolbar

## Node Types

Nodes are color-coded by type:

| Color | Type |
|-------|------|
| 🟠 Amber | Folders |
| 🟢 Green | Mods |
| 🔵 Blue | Resource Packs |
| 🟣 Purple | Shaders / Modpacks |

## Filtering

Control what appears in the visualization:

- **Folders** — Toggle folder nodes
- **Mods** — Toggle mod nodes
- **Resource Packs** — Toggle resource pack nodes
- **Shaders** — Toggle shader nodes
- **Modpacks** — Toggle modpack nodes

Use combinations to focus on specific aspects of your library.

## Interaction

### Navigation

- **Pan** — Click and drag on empty space
- **Zoom** — Mouse wheel or pinch gesture
- **Reset View** — Click the home button or press `Home`

### Node Interaction

- **Click** — Select and highlight node
- **Double-click** — Open node details
- **Drag** — Move node (simulation adjusts)
- **Hover** — Show tooltip with info

### Search

1. Use the search bar at the top
2. Type to filter nodes
3. Matching nodes are highlighted
4. Click a result to focus on that node

## Performance Mode

For very large libraries, enable **Performance Mode**:

- Simplified node rendering
- Reduced visual effects
- Faster physics simulation
- Toggle in the toolbar

## Layout Controls

### Zoom Presets

Quick zoom buttons:
- **Fit All** — Zoom to show all nodes
- **1:1** — Reset to default zoom
- **Custom** — Use mouse wheel

### Simulation

The force simulation has parameters you can adjust:
- Nodes naturally repel each other
- Connected nodes attract
- The system finds equilibrium

## Use Cases

### Visualize Library Size

See at a glance how large your collection is and how it's distributed across folders.

### Find Orphan Mods

Mods without connections (no folder, no modpack) stand out as isolated nodes.

### Understand Modpack Composition

Select a modpack to see all connected mods highlighted.

### Explore Dependencies

When dependency information is available, see which mods are commonly used together.

## Tips

- Use **filters** to reduce clutter when exploring
- **Performance mode** is recommended for 500+ nodes
- **WebGL mode** handles animations more smoothly
- Double-click empty space to reset the view
