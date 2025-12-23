# Statistics

The Statistics view provides insights about your mod library with interactive, customizable charts.

## Dashboard Overview

The stats dashboard shows:

- **Total Mods** — Count of all mods in library
- **Total Modpacks** — Number of modpacks created
- **Total Size** — Estimated download size
- **Loader Count** — Number of different loaders

These animate on load for a polished feel.

## Available Charts

### Loader Distribution

Visualize how your mods are distributed across loaders:
- Forge, Fabric, NeoForge, Quilt
- Shows percentage breakdown
- Chart types: Doughnut, Polar, Bar, Pie

### Version Distribution

See which Minecraft versions your mods support:
- Bar chart by version
- Identify your most-used versions
- Chart types: Bar, Line, Radar, Polar

### Content Type Breakdown

Distribution of content types:
- Mods vs Resource Packs vs Shaders
- Chart types: Doughnut, Polar, Bar, Pie

### Modpack Sizes

Compare modpack sizes:
- Bar chart of mod counts per modpack
- Identify your largest modpacks
- Chart types: Bar, Line

### Most Used Mods

Which mods appear in the most modpacks:
- Highlights frequently used mods
- Useful for identifying core dependencies
- Chart types: Bar, Polar, Radar

## Customization

### Chart Types

Each chart supports multiple visualization types. Click the chart type button to cycle through options.

### Colors

Customize the color palette:

1. Click the **Settings** button
2. Open **Color Picker**
3. Choose custom colors for each data series
4. Changes apply immediately

### Visibility

Hide charts you don't need:

1. Click **Settings** (gear icon)
2. Toggle visibility for each chart
3. Hidden charts don't render

Your preferences are saved automatically.

## Refreshing Data

The dashboard loads data on view. To refresh:

1. Click the **Refresh** button in the toolbar
2. Stats recalculate from current library

## Exporting

While there's no direct export, you can:
- Screenshot the dashboard
- Use browser dev tools to capture charts
- Access raw data in `%APPDATA%\modex\modex\library.json`

## Performance

For very large libraries:
- Initial calculation may take a moment
- Animated counters smooth the experience
- Charts render progressively
