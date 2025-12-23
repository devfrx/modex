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

### Dependency Checking

Click **Check Dependencies** to analyze mod compatibility:
- Identifies missing required dependencies
- Shows optional dependencies you might want
- Lists incompatible mod combinations

## Profiles

Modpacks support multiple **profiles** — variations of the same modpack:

- **Default Profile** — Your main configuration
- **Custom Profiles** — Create lightweight or extended versions

### Creating a Profile

1. Open the modpack editor
2. Click the **Profiles** tab
3. Click **New Profile**
4. Name it and optionally base it on an existing profile

### Switching Profiles

The active profile determines which mods are exported. Switch profiles in the editor header.

## Version History

ModEx automatically tracks changes to your modpacks:

- Every add/remove creates a history entry
- View the timeline in the **History** panel
- Restore previous versions if needed

### Viewing History

1. Open modpack editor
2. Click the **History** tab
3. See chronological list of changes
4. Click any entry to see details

### Restoring a Version

1. Find the version you want in History
2. Click **Restore**
3. The modpack reverts to that state

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
2. Click **Export**
3. Choose format:

| Format | Use With |
|--------|----------|
| **CurseForge** (.zip) | CurseForge App |
| **Prism/MultiMC** | Prism Launcher, MultiMC |
| **MODEX** (.modex) | Backup, sharing, import |

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
- Profiles and history

Share this file with others — they can import it into their ModEx.

### Share Link

1. Open the modpack
2. Click **Share** button
3. Choose **Generate Gist** (requires GitHub auth)
4. Share the generated URL

Recipients can import directly from the link.
