# Settings

Configure ModEx through the Settings view, accessible via the gear icon in the sidebar.

## General Tab

### API Configuration

- **CurseForge API Key** — Required for all CurseForge features
- Status indicator shows connection health
- See [API Key Setup](/guide/api-key) for instructions

### Updates

- **Check for Updates** — Manually check for new versions
- Auto-update is enabled by default
- Update notifications appear when available

### Instance Sync

- **Auto-sync before launch** — Sync modpack to instance before playing
- **Show sync confirmation** — Prompt before syncing
- **Default config sync mode** — Overwrite, New Only, or Skip

## Appearance Tab

### Theme

Choose your preferred color scheme:
- **Light** — Bright theme
- **Dark** — Dark theme
- **System** — Follow OS preference

### Accent Color

Customize the accent color used throughout the UI:
- Preset colors available
- Used for buttons, highlights, and active states

### Style Presets

Quick styling options:
- **Default** — Standard appearance
- **Compact** — Reduced padding
- **Comfortable** — Extra spacing

### Custom Styling

Fine-tune visual parameters:
- Border radius
- Animation speed
- Font size adjustments

Click **Reset** to restore defaults.

## Sidebar Tab

Configure the sidebar navigation:

### Position

- **Left** — Sidebar on left (default)
- **Right** — Sidebar on right side

### Collapsed State

- Toggle default collapsed/expanded
- Sidebar remembers your preference

### Item Visibility

Show or hide sidebar items:
- Home, Library, Modpacks, Organize
- Stats, Sandbox, Guide, Settings
- Drag to reorder

## Data Tab

### Storage Information

View storage usage:
- Library size (mod count)
- Modpack count
- Database file size

### Clear Data

::: danger
These actions are destructive and cannot be undone.
:::

- **Clear Library** — Remove all mods
- **Clear Modpacks** — Remove all modpacks
- **Clear All Data** — Factory reset

### Export/Import

- **Export Library** — Backup everything
- **Restore from Backup** — Load a backup file
- **Open Data Folder** — Browse to `%APPDATA%\modex`

## About Tab

View application information:
- **Version** — Current ModEx version
- **Build** — Build information
- **Links** — GitHub, documentation, support

## Settings Storage

Settings are saved to:
```
%APPDATA%\modex\settings.json
```

Changes apply immediately. Most settings don't require restart.
