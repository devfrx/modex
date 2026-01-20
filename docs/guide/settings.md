# Settings

Configure ModEx through the Settings view, accessible via the gear icon in the sidebar.

## General Tab

### CurseForge API

**API Key** — Required for all CurseForge features (browsing, searching, downloading mods).

1. Enter your CurseForge API key
2. Click **Save**

See [API Key Setup](/guide/api-key) for instructions on obtaining a key.

---

### GitHub Gist

Connect your GitHub account to publish modpack manifests directly to GitHub Gist. This enables easy sharing and collaboration with friends.

#### Setting Up GitHub Gist Access

1. **Create a Personal Access Token:**
   - Go to [GitHub Token Settings](https://github.com/settings/tokens/new?scopes=gist&description=ModEx%20Gist%20Access)
   - Or manually: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Name it (e.g., "ModEx Gist Access")
   - Select the **`gist`** scope (only this scope is required)
   - Click "Generate token"
   - **Copy the token immediately** (you won't see it again!)

2. **Connect in ModEx:**
   - Go to Settings → General
   - Find the "GitHub Gist" section
   - Paste your token in the input field
   - Click **Connect**
   - If valid, you'll see your GitHub avatar and username

#### Once Connected

You'll see:
- Your GitHub avatar and username
- A "Disconnect" button to remove the token
- Default Manifest Mode setting

#### Default Manifest Mode

Choose which version history to include when publishing:

| Mode | Description |
|------|-------------|
| **Full History** | Includes all version tags. Subscribers can rollback to previous versions. |
| **Current Version Only** | Smaller file size. Only the latest modpack state, no history for subscribers. |

#### Using Gist Publishing

Once connected, you can publish modpacks from the **Share** tab in the Modpack Editor:

1. Open a modpack
2. Go to the **Share** tab
3. Click **Create Gist** (or **Update Gist** if already published)
4. The raw URL is automatically copied to your clipboard
5. Share this URL with friends — they can import it in ModEx!

#### Disconnecting

Click **Disconnect** in the GitHub Gist section to remove your token. You'll need to reconnect to use Gist features again.

---

### Updates

The Updates section shows:
- Current ModEx version
- Available updates (if any)
- Update and restart options

---

### Sync Settings

Configure how ModEx syncs mods between modpacks and game instances.

#### Instant File Sync (Recommended)

When enabled, mod changes (add, remove, update) are immediately applied to the instance folder. This eliminates the need for manual "Sync" operations.

- **Enabled (Recommended):** Changes sync instantly
- **Disabled:** Manual sync required before playing

#### Auto-sync Before Launch

Automatically sync mods when launching the game.

- **Enabled:** Always ensures instance matches modpack
- **Disabled:** Launch with current instance state

#### Show Confirmation Dialog

Ask before syncing when differences are detected between modpack and instance.

- **Enabled:** Review changes before applying
- **Disabled:** Sync silently

#### Default Config Sync Mode

How to handle config files during sync:

| Mode | Description |
|------|-------------|
| **New Only** | Only add new config files, keep existing unchanged |
| **Overwrite** | Replace all configs with modpack versions |
| **Skip** | Don't sync configs at all |

---

## Look & Feel Tab

### Theme

Choose your preferred color scheme:
- **Dark** — Dark theme (default)
- **Light** — Bright theme

Additional theme variations are available.

### Style Presets

Quick styling options with pre-configured colors:
- Emerald (default)
- Ocean
- Violet
- Rose
- Amber
- Neon
- Glass
- Minimal
- Snow

### Custom Styling

Fine-tune visual parameters:

| Setting | Description |
|---------|-------------|
| **Primary Color Hue** | Full spectrum slider (0-360°), plus black (-10 to 0) and white (360-370) |
| **Saturation** | Color intensity (0-100%) |
| **Lightness** | Color brightness (0-100%) |
| **Border Radius** | Corner rounding (0-20px) |

Click **Reset** to restore defaults.

---

## Navigation Tab (Sidebar)

### Position

Choose sidebar placement:
- **Left** — Sidebar on left (default)
- **Right** — Sidebar on right side

### Item Visibility

Show or hide sidebar items for each game:
- **Minecraft:** Home, Library, Modpacks, Instances
- **Hytale:** (Future support)

Toggle items on/off based on your workflow.

### Collapse Behavior

- Toggle default collapsed/expanded state
- Sidebar remembers your preference between sessions

---

## Launchers Tab

View detected Minecraft launcher installations:

### Detected Installations

ModEx automatically detects:
- **CurseForge App** — Installations in CurseForge's minecraft folder
- **Prism Launcher** — Prism/MultiMC instance locations
- **MultiMC** — Legacy MultiMC instances
- **Official Launcher** — Vanilla Minecraft installation

### Displayed Information

For each detected launcher:
- Launcher name and icon
- Installation path
- Number of instances found

---

## Storage Tab (Library)

### Library Path

View where ModEx stores its data:
- Database file location
- Instance data folder

### Storage Information

ModEx uses **metadata-only storage**:
- Mod files are not downloaded until you sync to an instance
- Your library is just references (CurseForge project/file IDs)
- Library stays under 5MB even with thousands of mods

### Library Statistics

View counts of:
- Total mods in library
- Total modpacks created

### Data Management

**Danger Zone:**
- **Clear All Data** — Permanently delete all mods and modpacks (factory reset)
- Requires confirmation before proceeding

---

## Keyboard Shortcuts Tab

Reference list of all keyboard shortcuts:

| Shortcut | Action |
|----------|--------|
| **Ctrl + F** | Search mods/modpacks |
| **Ctrl + N** | Create modpack from selection |
| **Ctrl + A** | Select all |
| **Delete** | Delete selected |
| **Escape** | Clear selection / Close dialog |
| **1** | Switch to Grid view |
| **2** | Switch to List view |
| **3** | Switch to Compact view |

See [Keyboard Shortcuts](/guide/shortcuts) for the full list.

---

## About Tab

View application information:

- **ModEx Logo** — Application branding
- **Version** — Current ModEx version
- **Build** — Build information and date

### Links

- **GitHub** — Source code repository
- **Documentation** — Online documentation
- **Report Issue** — Bug tracker

---

## Settings Storage

Settings are stored in two locations:

| Type | Location |
|------|----------|
| **API keys, sync settings** | `%APPDATA%\modex\modex\config.json` |
| **UI preferences** (theme, sidebar, etc.) | Browser localStorage |

**Changes apply immediately.** Most settings don't require restart.
