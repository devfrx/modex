# Game Instances

ModEx can create isolated game instances and launch Minecraft directly.

## Creating an Instance

1. Open a modpack in the editor
2. Click **Play** in the toolbar
3. In the Play dialog, click **Create Instance**
4. The instance is created with the modpack's mods and configs

## Instance Features

Each instance provides:

- **Isolated Environment** — Separate mods, configs, saves
- **Custom RAM Settings** — Configure min and max memory
- **JVM Arguments** — Add custom Java arguments
- **Sync Control** — Choose when to sync mods and configs
- **Statistics** — View mod count, config count, total size

## Launching Games

### From Modpack Editor

1. Open a modpack
2. Click **Play**
3. Select or create an instance
4. Click **Launch**

### Smart Sync

Before launching, ModEx checks if the instance needs syncing:
- If mods have changed, prompts to sync
- Configure auto-sync in Settings

### Running Game Detection

- ModEx shows when a game is running
- View live game logs with filtering
- Kill the game from within ModEx

## Instance Settings

### Memory Configuration

Set RAM allocation:
- **Minimum Memory** — Starting heap size (e.g., 2048 MB)
- **Maximum Memory** — Maximum heap size (e.g., 8192 MB)

### JVM Arguments

Add custom arguments for Java:
- Performance flags
- GC tuning
- Debug options

## Sync Options

### Sync Modes

| Mode | Behavior |
|------|----------|
| **Overwrite** | Replace all existing files |
| **New Only** | Only add new files, keep existing |
| **Skip** | Don't sync this category |

### Automatic Sync

Enable in Settings > General:
- **Instant file sync** — Sync immediately when changes occur
- **Auto-sync before launch** — Always sync before starting game
- **Show confirmation dialog** — Prompt before syncing

## Live Logs

When a game is running, view logs in real-time:

1. Open the Play dialog while game is running
2. Switch to the **Logs** tab
3. Filter by level: All, Info, Warn, Error
4. Logs update in real-time

## Detecting Installations

ModEx can detect Minecraft installations from:

- **CurseForge App**
- **Prism Launcher**
- **MultiMC**
- **Official Minecraft Launcher**

View detected installations in Settings > Launchers (Minecraft).

## Troubleshooting

### Game Won't Launch

- Check Java is installed and accessible
- Verify RAM settings don't exceed available memory
- Check the game logs for errors

### Sync Issues

- Ensure the game isn't running during sync
- Check write permissions to instance folder
- Verify CurseForge API key is configured

### Version Mismatch

If syncing to a different game version:
- ModEx will warn about incompatible mods
- Review and resolve before syncing
