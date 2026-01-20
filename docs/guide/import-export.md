# Import & Export

ModEx supports various formats for importing and exporting your mod collections.

## Export Formats

### MODEX Format (.modex)

The native ModEx format preserves everything:

- Complete modpack metadata
- All mod references (CurseForge IDs)
- Folder organization
- Profiles and history

**Use for:** Backups, sharing with other ModEx users

### CurseForge Format (.zip)

Standard CurseForge modpack format:

- `manifest.json` with mod references
- Overrides folder for configs
- Compatible with CurseForge App, Prism Launcher, MultiMC

**Use for:** Importing into any launcher that supports CurseForge format

## Exporting a Modpack

1. Open a modpack in the Modpacks view
2. Click the **Export** button (or use Share dialog)
3. Choose **CurseForge** (.zip) format
4. Select save location
5. Import the exported file into your launcher

## Importing

### From File

1. Go to **Modpacks** view
2. Click **Import**
3. Select a `.modex` or CurseForge `.zip` file
4. Review the import preview
5. Click **Import**

### From URL

1. Click **Import from URL**
2. Paste a GitHub Gist URL (shared ModEx modpack)
3. ModEx fetches and imports

### From CurseForge

1. Click **Browse CurseForge Modpacks**
2. Find a modpack
3. Click **Import**
4. The modpack is added to your collection

## Sharing

### Export as .modex

1. Open a modpack
2. Click **Share** button
3. Export as `.modex` file
4. Share the file with others

### Import .modex

1. Click **Share** in the Modpacks view
2. Select **Import** tab
3. Choose a `.modex` file
4. The modpack is imported

### Import from URL

If someone shares a Gist URL with a modpack:

1. Click **Share** button
2. Go to **Import** tab
3. Paste the URL in the **Import from URL** field
4. Click **Import**

### Direct File Sharing

Export as `.modex` and share via:
- Cloud storage (Google Drive, Dropbox, etc.)
- Discord file upload
- Email attachment

## Backup

### Manual Backup

For complete backup of your library, copy the data folder:
```
%APPDATA%\modex\modex\
```

This includes your library, modpacks, and version history.
You can also export individual modpacks as `.modex` files for sharing or backup.

### Configuration Backups

When syncing to game instances, ModEx creates config backups in the instance's config backup folder.

## Remote Sync (GitHub Gist)

ModEx can publish modpacks to GitHub Gist for cloud backup and sharing.

### Setup

1. Go to **Settings > General**
2. Enter your **GitHub Token** (needs Gist permissions)
3. Your GitHub avatar appears when connected

### Publishing a Modpack

1. Open a modpack in the editor
2. Go to the **Remote** tab
3. Click **Publish to Gist**
4. The modpack is uploaded and you receive a shareable URL

### Subscribing to a Remote Modpack

1. Get a Gist URL from someone
2. In Modpacks view, click **Import > From URL**
3. Paste the URL and import
4. The modpack shows a cloud badge indicating it's subscribed

### Checking for Updates

1. Open a subscribed modpack
2. Go to the **Remote** tab
3. Click **Check for Updates**
4. If updates are available, review them in the Update Review dialog

### Applying Updates

1. Review the changes shown in the Update Review dialog
2. Choose which changes to apply
3. Resolve any conflicts if prompted
4. Click **Apply** to update your local modpack

### Auto-Check

Enable **Auto-check remote** in the Remote tab to automatically check for updates when opening the modpack.
