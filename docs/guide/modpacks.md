# Modpacks

Modpacks in ModEx are curated collections of mods, resource packs, and shaders from your library. Create modpacks for different play styles, Minecraft versions, or projects.

## Creating a Modpack

1. Go to the **Modpacks** view from the sidebar
2. Click **Create Modpack** (or use the "+" button)
3. Fill in the details:
   - **Name** — A descriptive name for your modpack
   - **Game Version** — Minecraft version (e.g., 1.20.1)
   - **Loader** — Forge, Fabric, NeoForge, or Quilt
   - **Loader Version** — Specific loader version (auto-populated from CurseForge)
   - **Description** (optional) — Notes about this modpack
4. Click **Create**

> **Note:** Minecraft version and loader cannot be changed after creation. To use a different version, create a new modpack.

## The Modpack Editor

Open any modpack to access the full editor with 7 main tabs accessible via the tab bar.

### Tab Navigation

The editor has a main tab bar with quick access to:
- **Resources** — Manage mods, resource packs, and shaders
- **Configs** — Browse and edit configuration files
- **Details** — Modpack metadata and settings
- **Share** — Remote sync and collaboration options

Additional tabs available under "More":
- **Add Mods** — Smart discovery suggestions
- **Diagnostics** — Health check and dependency analysis
- **History** — Version control system

---

## Resources Tab

The main panel showing all content in your modpack.

### Content Type Tabs

Switch between different resource types:
- **Mods** — Game modifications (.jar files)
- **Packs** — Resource packs and texture packs
- **Shaders** — Shader packs (Optifine/Iris)

### Filters

Quick filter buttons to focus on specific mods:

| Filter | Description |
|--------|-------------|
| **All** | Show all installed content |
| **Incompatible** | Show only mods with wrong version/loader |
| **Updates** | Show only mods with updates available |
| **Disabled** | Show only disabled mods |

Additional filters (in overflow menu):
- **Warnings** — Show mods with compatibility warnings
- **Locked** — Show only locked mods
- **With Notes** — Show mods that have personal notes
- **Just Updated** — Recently updated mods (with badge)
- **Just Added** — Recently added mods (with badge)

### Mod Actions

For each mod in the list, you can:

| Action | Icon | Description |
|--------|------|-------------|
| **Toggle** | Switch | Enable/disable the mod |
| **Checkbox** | ☐ | Select for bulk operations |
| **Quick Update** | ↑ | Update to latest release version |
| **Version Picker** | Branch | Choose any specific version (alpha/beta/release) |
| **Lock** | 🔒 | Lock mod to prevent changes |
| **Notes** | 💬 | Add personal notes to the mod |
| **Remove** | 🗑 | Remove from modpack |

### Bulk Operations

Select multiple mods using checkboxes, then:
- **Enable All** — Enable all selected mods
- **Disable All** — Disable all selected mods
- **Lock All** — Lock selected mods
- **Unlock All** — Unlock selected mods
- **Remove Selected** — Remove all selected mods

### Quick Actions Bar

- **Check Updates** — Check all mods for available updates
- **Update All** — Update all mods to latest versions (excludes locked)
- **Remove Incompatible** — Remove all incompatible mods (excludes locked)
- **Library** — Toggle visibility of library panel (add from local library)
- **CurseForge** — Open CurseForge search dialog

### Library Panel

When enabled, shows available mods from your library that aren't in this modpack:
- Grouped by compatibility status (compatible first)
- Click "+" to add a mod to the modpack
- Search within available mods

---

## Locking Mods

You can **lock** important mods to protect them from accidental changes:

- **Locked mods** cannot be:
  - Removed from the modpack
  - Disabled/enabled
  - Updated (version changes blocked)
- They are excluded from all bulk operations
- They are preserved during version rollback

### How to Lock

1. In the mods list, hover over a mod row
2. Click the lock icon 🔒
3. The mod is now protected

### Unlocking

Click the lock icon again to unlock a mod and allow changes.

---

## Add Mods Tab (Discover)

Smart recommendations for new content based on your existing mods.

### Features

- **Category-based suggestions** — Recommends mods from categories you already use
- **Shuffle** — Click to see different recommendations
- **Content tabs** — Switch between Mods, Resource Packs, Shaders
- **One-click add** — Click a card to add it to your modpack
- **External link** — Open on CurseForge for more details

> **Tip:** Recommendations improve as you add more mods — it learns your preferred categories!

---

## Diagnostics Tab (Health)

Scan your modpack for issues and get recommendations.

### What it Detects

| Issue Type | Description |
|------------|-------------|
| **Missing Dependencies** | Required mods that aren't installed |
| **Conflicts** | Known incompatible mod combinations |
| **RAM Estimate** | Memory requirements for your modpack |
| **Optimization Tips** | Suggestions to improve performance |

### Quick Actions

- **Sync Deps** — Fetch latest dependency data from CurseForge
- **Install All** — Add all missing dependencies automatically
- **View Warnings** — See detailed compatibility warnings

---

## History Tab (Version Control)

Git-style version control for your modpack.

### Creating Versions

When you've made changes you want to save:

1. Go to the **History** tab
2. Click **Save Version**
3. Enter a commit message describing the changes
4. Click **Create**

### What's Tracked

The version system tracks:
- Mods added or removed
- Mods enabled or disabled
- Mod version updates
- Mods locked or unlocked
- Config file changes
- Loader version changes
- Mod notes

### Viewing History

- See chronological list of all saved versions
- Click any version to expand and see detailed changes
- Changes show added (green), removed (red), and modified (yellow) items

### Unsaved Changes Indicator

The History tab shows a badge when you have unsaved changes:
- Shows count of pending changes
- Review what's changed since last version
- Choose to save as new version or revert all changes

### Restoring a Version (Rollback)

1. Find the version you want in History
2. Click **Revert** on that version
3. Confirm the rollback
4. Modpack returns to that exact state

> **Note:** Locked mods are preserved during rollback.

---

## Configs Tab

Manage configuration files for your modpack.

### Requirements

You need a **game instance** to access configs. If none exists:
1. Click **Create Instance** in the Configs tab
2. Or use the Play button to create one

### Config Browser

- Browse mod configuration files hierarchically
- Supports TOML, JSON, and Properties files
- Filter by file name

### Structured Editor

Click any config file to open the structured editor:
- Edit values with a friendly UI
- See original values and defaults
- Validate changes before saving

### Config Changes Banner

When you play the game and change settings, those changes happen in the **instance** folder. The banner appears to let you import these changes back into the modpack.

#### Understanding Config Locations

| Location | Purpose |
|----------|---------|
| **Instance Configs** | Where Minecraft runs and saves your in-game changes |
| **Modpack Overrides** | The "official" configs saved with the modpack |

#### Importing Config Changes

1. The banner shows "Config Changes Detected" with count
2. Expand to see which files changed
3. Check the files you want to import
4. Click **Import Selected**
5. Your changes are now part of the modpack

Options:
- **Show new configs** — Include configs generated by mods that don't exist in overrides yet
- **Select All / Clear** — Quick selection helpers

---

## Details Tab (Settings)

Modpack metadata and configuration.

### Editable Fields

| Field | Description |
|-------|-------------|
| **Name** | Display name of your modpack |
| **Version** | Your modpack's version number (e.g., 1.0.0) |
| **Description** | Notes about the modpack |

### Read-Only Fields (Locked)

These cannot be changed after creation:
- **Minecraft Version** — Game version
- **Loader Type** — Forge/Fabric/NeoForge/Quilt
- **Loader Version** — Specific loader version (can select from dropdown)

### Cover Image

- Click the image icon in the header to set/change cover image
- Supports common image formats
- Image is shown in modpack list and editor header

---

## Share Tab (Remote)

Publish and sync modpacks with others.

### Publisher Mode

For modpack creators who want to share with others:

#### GitHub Gist Publishing

1. **Setup** — Add your GitHub token in Settings → GitHub Gist (one-time)
2. **Create Gist** — Click "Create Gist" to publish
3. **Update Gist** — After changes, click "Update Gist"
4. **Share URL** — The raw URL is copied to clipboard automatically

#### Actions

| Action | Description |
|--------|-------------|
| **Copy URL** | Copy the raw Gist URL for sharing |
| **Open in Browser** | View the Gist on GitHub |
| **Delete Gist** | Remove the Gist from GitHub |

#### Manual Export

If you prefer to host elsewhere:
- **Full History** — Export with all version history
- **Current Only** — Export only current state

#### Resource List Export

Generate shareable mod lists:
- **Simple** — Just mod names
- **Detailed** — Names with versions and file info
- **Markdown** — Formatted for documentation

### Subscriber Mode

For users who want to sync with a remote modpack:

1. **Remote URL** — Paste the raw Gist/JSON URL
2. **Auto-check** — Enable to check for updates on startup
3. **Check Now** — Manually check for updates
4. **Review Changes** — See what's different before applying

#### Update Review Dialog

When updates are detected:
- Shows added, removed, and updated mods
- Shows loader/version changes
- Choose to apply or dismiss

> **Note:** When linked to a remote source, the modpack enters "sync mode" and publishing is disabled. Remove the URL to unlink.

---

## CurseForge Modpacks

If your modpack was imported from CurseForge:

### Check for Updates

1. In the Share tab, click **Check for Updates**
2. See if a new version is available on CurseForge
3. View the changelog

### Re-search Incompatible

If some mods failed to import (version mismatch):
1. Click **Re-search CurseForge**
2. ModEx searches for compatible versions
3. Found mods are automatically added

---

## Instance & Launch

ModEx creates game instances to run your modpack.

### Floating Action Bar

The floating bar at the bottom provides quick access:
- **Play/Stop Button** — Launch or stop the game
- **Sync Indicator** — Shows if sync is needed
- **Instance Settings** — RAM, JVM args, folder access

### Creating an Instance

1. Click the **Play** button (or "Create Instance" if none exists)
2. Instance is created with modpack settings
3. First launch installs the loader (Forge/Fabric/etc.)

### Sync Status

Before launching, ModEx shows sync status:
- **To Add** — Files missing from instance
- **To Update** — Files with version changes
- **To Remove** — Extra mods not in modpack
- **Enable/Disable Changes** — State mismatches

### Sync Modes

| Mode | Description |
|------|-------------|
| **New Only** | Add missing files, keep existing unchanged |
| **Overwrite** | Replace all files to match modpack exactly |
| **Skip** | Launch without syncing |

### Instance Settings

Click the settings icon on the floating bar:
- **Min/Max RAM** — Memory allocation (in MB)
- **JVM Arguments** — Custom Java arguments
- **Auto-sync** — Toggle automatic sync before launch
- **Sync Confirmation** — Show confirmation dialog

### Live Logs

When the game is running:
- View real-time game output
- Filter by level: All, Info, Warn, Error
- Kill game from ModEx if needed

### Instance Stats

- Mod count
- Config file count
- Total size
- Last played date

See [Game Instances](/guide/instances) for more details.

---

## Exporting Modpacks

Export your modpack for use with game launchers:

1. Open the modpack
2. Click **Export** in the header
3. Choose format:

| Format | Use With |
|--------|----------|
| **CurseForge** (.zip) | CurseForge App, Prism Launcher, MultiMC |
| **MODEX** (.modex) | Backup, sharing with other ModEx users |

4. Choose save location
5. Import the file into your launcher

### MODEX Format

The `.modex` format preserves:
- All modpack metadata
- Mod references (CurseForge IDs)
- Version history
- Locked mods
- Mod notes
- Config overrides

---

## Dependency Awareness

ModEx tracks dependencies automatically:

### When Removing Mods

- **Dependent mods warning** — Shows which mods will break
- **Orphaned dependencies** — Suggests removing unused dependencies
- Options: Remove anyway, Remove with dependents, Cancel

### When Disabling Mods

- Same warnings as removal
- Shows which mods depend on the one being disabled

### Bulk Operations

When removing/disabling multiple mods:
- Aggregates all dependency impacts
- Shows total affected mods
- Choose to proceed or cancel

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+F** | Search mods |
| **Ctrl+A** | Select all mods |
| **Delete** | Remove selected |
| **Escape** | Clear selection / Close dialog |

---

## Tips & Best Practices

1. **Lock important mods** — Protect core mods from accidental changes
2. **Save versions regularly** — Create snapshots before major changes
3. **Use descriptive version messages** — "Added Biomes O' Plenty" is better than "update"
4. **Check dependencies** — Use Diagnostics tab to find missing dependencies
5. **Sync configs** — Import your in-game config changes back to the modpack
6. **Use resource lists** — Export mod lists for documentation or sharing
