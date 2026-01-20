# Version Control

ModEx includes a git-style version control system for your modpacks, allowing you to create snapshots, track changes, and restore previous states.

## How It Works

ModEx uses a commit-based system similar to git:

1. **Initialize** version control for a modpack
2. Make changes to your modpack
3. **Create a version** (commit) when ready
4. Optionally **tag** important versions
5. **Revert** to any previous version if needed

## Initializing Version Control

1. Open a modpack in the editor
2. Go to the **Versions** tab
3. Click **Initialize Version Control**
4. Your modpack now tracks all changes

## Creating Versions

When you're happy with your current changes:

1. Click **Create Version**
2. Enter a descriptive commit message
3. Optionally add a tag (e.g., "v1.0", "stable")
4. Click **Create**

## What's Tracked

The version system tracks:

| Change Type | Description |
|-------------|-------------|
| **Mods Added** | New mods added to the modpack |
| **Mods Removed** | Mods removed from the modpack |
| **Mods Updated** | Mod versions changed |
| **Mods Enabled/Disabled** | Mod toggle states changed |
| **Mods Locked/Unlocked** | Lock status changes |
| **Config Changes** | Configuration file modifications |
| **Loader Changes** | Loader version updates |
| **Mod Notes** | Notes added to individual mods |

## Viewing History

1. Open the **Versions** tab
2. See a chronological list of all versions
3. Click any version to expand and see detailed changes
4. Each entry shows timestamp, message, and tag (if any)

## Unsaved Changes

At the top of the Versions tab, you'll see any changes made since the last version:

- Lists all modifications clearly
- **Revert Unsaved** — Discard all changes since last version
- **Create Version** — Save changes as a new version

## Restoring Versions

To restore a previous state:

1. Open the **Versions** tab
2. Find the version you want
3. Click **Revert** on that version
4. The modpack returns to that exact state

> **Note:** Reverting creates a new state — you can always go back forward by creating a new version.

## Tags

Tags mark important versions:

- **v1.0** — Major releases
- **stable** — Known-good configurations
- **pre-update** — Before major changes

Tags make it easy to find and restore specific versions.

## Best Practices

### Create Versions Frequently

- After adding a batch of mods
- Before updating mods
- When you have a working configuration

### Use Descriptive Messages

Good: "Added performance mods: Sodium, Lithium, Starlight"
Bad: "Updated stuff"

### Tag Important Versions

Mark milestones like "playable", "stable", "v1.0" for easy reference.

## Limitations

- History is stored locally in the modpack file
- When exporting, you can choose to include or exclude history
- History doesn't sync automatically between computers (use Remote Sync for that)
