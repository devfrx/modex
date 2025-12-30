# Version Control

ModEx includes a version history system for your modpacks, allowing you to track changes and restore previous states.

## How It Works

Every significant change to a modpack creates a history entry:

- Adding or removing mods
- Enabling or disabling mods
- Changing modpack settings
- Locking or unlocking mods

## Viewing History

1. Open a modpack in the editor
2. Click the **Versions** tab
3. See a chronological timeline of changes

Each entry shows:
- **Timestamp** — When the change occurred
- **Action** — What was modified
- **Details** — Specific changes made

## History Entry Types

| Type | Description |
|------|-------------|
| **Mod Added** | A mod was added to the modpack |
| **Mod Removed** | A mod was removed from the modpack |
| **Mod Updated** | A mod version was changed |
| **Bulk Add** | Multiple mods added at once |
| **Bulk Remove** | Multiple mods removed at once |
| **Settings Changed** | Modpack configuration modified |
| **Mod Locked** | A mod was protected from changes |
| **Mod Unlocked** | A mod protection was removed |

## Restoring Versions

To restore a previous state:

1. Open the **Versions** tab
2. Find the version you want
3. Click **Restore**
4. Confirm the action

The modpack reverts to that exact state. This is a non-destructive operation — a new history entry is created for the restore action.

> **Note:** Locked mods are preserved during rollback. Their lock status from the target version is restored.

## Best Practices

### Meaningful Changes

Group related changes together:
- Add all dependencies at once
- Update mods in batches
- Lock important mods to protect them

### Regular Exports

Export important versions as `.modex` files for external backup beyond the built-in history.

## Limitations

- History is stored locally
- Very old entries may be pruned automatically
- History doesn't sync between computers

For permanent backups, export your modpacks regularly.
