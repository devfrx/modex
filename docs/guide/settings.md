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

## Minecraft Tab

View detected Minecraft installations and launchers. ModEx auto-detects:
- CurseForge App
- Prism Launcher
- MultiMC
- Official Minecraft Launcher

## Library Tab

### Statistics

View library stats:
- Total mod count
- Modpack count

### Storage Information

ModEx uses metadata-only storage — mod files are not downloaded until you sync to an instance.

### Danger Zone

::: danger
This action is destructive and cannot be undone.
:::

- **Clear All Data** — Permanently delete all mods and modpacks (factory reset)

## Shortcuts Tab

View available keyboard shortcuts for quick navigation and actions.

## About Tab

View application information:
- **Version** — Current ModEx version
- **Build** — Build information
- **Links** — GitHub, documentation, support

## Settings Storage

Settings are stored in two locations:
- **API keys and sync settings**: `%APPDATA%\modex\modex\config.json`
- **UI preferences** (theme, sidebar, etc.): Browser localStorage

Changes apply immediately. Most settings don't require restart.
