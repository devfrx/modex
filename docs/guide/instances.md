# Game Instances

ModEx can detect and sync with Minecraft installations from popular launchers.

## Supported Launchers

ModEx can detect instances from:

- **CurseForge App**
- **Prism Launcher**
- **MultiMC**
- **Official Minecraft Launcher**

## Detecting Instances

1. Go to **Settings**
2. Navigate to the **Minecraft** tab
3. Click **Rescan** to detect installations
4. ModEx searches common installation paths
5. Detected instances appear in the list

### Manual Addition

If an instance isn't detected:

1. Click **Add Instance**
2. Browse to the instance folder
3. Select the folder containing `mods/`
4. Name the instance
5. Click **Add**

## Instance Information

Each detected instance shows:

- **Name** — Instance display name
- **Path** — Folder location
- **Game Version** — Minecraft version
- **Loader** — Forge, Fabric, etc.
- **Mod Count** — Number of mods installed

## Linking Modpacks

Connect a modpack to a game instance for syncing:

1. Open a modpack in the editor
2. Click **Link Instance**
3. Select an instance from the list
4. Choose sync settings:
   - **Sync Mods** — Copy mod files
   - **Sync Configs** — Copy configuration files
5. Confirm the link

### Sync Modes

| Mode | Behavior |
|------|----------|
| **Overwrite** | Replace all existing files |
| **New Only** | Only add new files, keep existing |
| **Skip** | Don't sync this category |

## Syncing

After linking, sync your modpack:

1. Open the modpack
2. Click **Sync to Instance**
3. ModEx downloads required mods from CurseForge
4. Files are copied to the instance folder

### Before Launch Sync

Enable automatic syncing in Settings:

1. Go to **Settings > General**
2. Find **Instance Sync** section
3. Enable **Auto-sync before launch**
4. When you launch from ModEx, it syncs first

## Viewing Installations

See detected Minecraft installations:

1. Go to **Settings > Minecraft**
2. Detected installations are listed by launcher type
3. View paths and set default installation

## Troubleshooting

### Instance Not Detected

- Ensure the launcher has been run at least once
- Check that instances exist in standard locations
- Use manual addition for custom paths

### Sync Failures

- Check write permissions to the instance folder
- Ensure the game isn't running
- Verify CurseForge API key is configured

### Version Mismatch

If syncing to a different game version:
- ModEx will warn about incompatible mods
- Review and resolve before syncing
