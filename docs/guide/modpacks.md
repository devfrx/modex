# Modpacks

Modpacks in ModEx are curated collections of mods from your library. Create modpacks for different play styles, Minecraft versions, or projects.

## Creating a Modpack

1. Go to the **Modpacks** view
2. Click **Create Modpack**
3. Fill in the details:
   - **Name** — A descriptive name
   - **Game Version** — Minecraft version (e.g., 1.20.1)
   - **Loader** — Forge, Fabric, NeoForge, or Quilt
   - **Description** (optional) — Notes about this modpack
4. Click **Create**

## The Modpack Editor

Open any modpack to access the full editor with multiple panels:

### Mods Panel

The main panel showing all mods in this modpack:
- Search and filter mods
- Toggle mods enabled/disabled
- Remove mods from the modpack

### Adding Mods

Two ways to add mods:

1. **From Library** — Click **Add from Library**, select mods, confirm
2. **From CurseForge** — Click **Browse CurseForge**, search and add directly

### Dependency Awareness

ModEx tracks dependencies automatically:
- Warns when removing mods that others depend on
- Shows dependency impact when disabling mods
- The **Health** tab identifies compatibility issues

## Locking Mods

You can **lock** important mods to protect them from accidental changes:

- **Locked mods** cannot be removed, disabled, or have their version changed
- They are excluded from bulk operations (enable all, disable all, remove selected)
- They are preserved during version rollback

### How to Lock

1. In the mods list, hover over a mod
2. Click the lock icon
3. The mod is now protected

### Unlocking

Click the lock icon again to unlock a mod and allow changes.

## Version History

ModEx automatically tracks changes to your modpacks:

- Every add/remove creates a history entry
- View the timeline in the **Versions** panel
- Restore previous versions if needed
- Lock/unlock actions are also tracked

### Viewing History

1. Open modpack editor
2. Click the **Versions** tab
3. See chronological list of changes
4. Click any entry to see details

### Restoring a Version

1. Find the version you want in Versions tab
2. Click **Restore**
3. The modpack reverts to that state

> **Note:** Locked mod status is also restored from the version you rollback to.

## Configuration Editor

ModEx includes a built-in config file editor:

1. Open modpack editor
2. Click the **Configs** tab
3. Browse mod configuration files
4. Edit with syntax highlighting
5. Changes are saved with the modpack

This is useful for pre-configuring mods before export.

## Exporting Modpacks

Export your modpack for use with game launchers:

1. Open the modpack
2. Click **Export** or **Share**
3. Choose format:

| Format | Use With |
|--------|----------|
| **CurseForge** (.zip) | CurseForge App, Prism Launcher, MultiMC |
| **MODEX** (.modex) | Backup, sharing with other ModEx users |

4. Choose save location
5. Import the file into your launcher

## Instance Sync

Link modpacks to game instances for direct deployment:

1. Open modpack editor
2. Click **Link Instance**
3. Select a detected game instance
4. Choose sync options:
   - **Mods** — Sync mod files
   - **Configs** — Sync configuration
   - **Overwrite** vs **New Only** modes

See [Game Instances](/guide/instances) for setup details.

## Sharing Modpacks

### Export as MODEX

The `.modex` format preserves:
- All modpack metadata
- Mod references (CurseForge IDs)
- Folder organization
- Locked mods and history

Share this file with others — they can import it into their ModEx.

### Import from URL

If someone shares a URL (e.g., a Gist with a modpack), you can import directly:

1. Open the **Share** dialog
2. Go to **Import** tab
3. Paste the URL
4. Click **Import**
