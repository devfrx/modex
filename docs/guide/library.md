# Library

The Library is your central hub for managing all mods, resource packs, and shaders. It provides powerful search, filtering, and organization tools.

## Overview

The Library view displays all content you've added to ModEx. Each item shows:
- **Name** and **Author**
- **Game Version** and **Loader** (Forge, Fabric, NeoForge, Quilt)
- **Content Type** indicator (mod, resource pack, shader)
- **Modpack usage** — which modpacks include this item

## View Modes

Toggle between different layouts using the toolbar buttons or keyboard shortcuts:

- **Grid View** (`1`) — Card layout with mod icons
- **List View** (`2`) — Compact rows for scanning many items
- **Compact View** (`3`) — Minimal rows for maximum density
- **Gallery View** — Large thumbnails for visual browsing

## Search & Filters

### Quick Search

Press `Ctrl + F` or click the search bar to filter by:
- Mod name
- Author name
- Description

### Quick Filters

Use the quick filter buttons in the toolbar:
- **All** — Show all mods
- **Favorites** — Show only favorited mods
- **Recent** — Show recently added mods

### Advanced Filters

Click the **Filter** button to open the filter panel:

| Filter | Options |
|--------|---------|
| **Content Type** | All Types, Mods Only, Resource Packs, Shaders |
| **Game Version** | Any version in your library |
| **Loader** | All, Forge, Fabric, NeoForge, Quilt |
| **Usage** | Any Status, Used in modpacks, Unused |
| **Modpack** | Filter by specific modpack |

### Search Field

Narrow your search to specific fields using the field selector:
- **All** — Search everything
- **Name** — Mod name only
- **Author** — Author name only
- **Version** — Mod version string

## Favorites

Mark mods as favorites for quick access:

1. Hover over a mod card
2. Click the **heart icon**
3. Use the **Favorites** quick filter to show only favorites

Favorites are stored locally and persist across sessions.

## Duplicate Detection

ModEx automatically detects duplicate mods (same mod, different versions or loaders):

- Duplicates are highlighted with a warning indicator
- Use this to clean up your library or identify version conflicts

## Bulk Actions

Select multiple items for batch operations:

1. `Ctrl + Click` to add/remove from selection
2. `Shift + Click` to select a range
3. `Ctrl + A` to select all visible items

With items selected, the **Bulk Action Bar** appears:

- **Add to Modpack** — Add selected items to a modpack
- **Delete** — Remove from library

## Adding Mods

### From CurseForge

1. Click the **Add Mods** button in the toolbar
2. Search for mods in CurseForge
3. Click **Add to Library** on any result

### Import from File

If you have an existing modpack file, see [Import & Export](/guide/import-export).

## Checking for Updates

1. Click the **Updates** button in the toolbar
2. ModEx queries CurseForge for newer versions
3. A dialog shows available updates for your game version and loader
4. Select which mods to update

## Column Customization

In List view, customize visible columns:

1. Click the **Columns** button
2. Toggle columns on/off:
   - Thumbnail, Name, Version
   - Loader, Author, Game Version
   - Date, Size, Usage

Your preferences are saved automatically.

## Grouping

Enable **mod grouping** to combine mod variants (different versions of the same mod) into expandable groups. This helps reduce clutter when you have multiple versions of the same mod.

## Pagination

Configure items per page at the bottom of the view. The pagination controls let you navigate through large libraries efficiently.
