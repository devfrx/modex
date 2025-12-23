# Import & Export

ModEx supports various formats for importing and exporting your mod collections.

## Export Formats

### MODEX Format (.modex)

The native ModEx format preserves everything:

- Complete modpack metadata
- All mod references (CurseForge IDs)
- Folder organization
- Profiles and history
- Configuration files

**Use for:** Backups, sharing with other ModEx users

### CurseForge Format (.zip)

Standard CurseForge modpack format:

- `manifest.json` with mod references
- Overrides folder for configs
- Compatible with CurseForge App

**Use for:** CurseForge App import

### Prism/MultiMC Format

Folder structure compatible with:

- Prism Launcher
- MultiMC
- Other MultiMC-based launchers

**Use for:** These launchers' import features

## Exporting a Modpack

1. Open the modpack in the editor
2. Click **Export** button
3. Select format from dropdown
4. Choose destination folder
5. Click **Export**

### Export Options

Depending on format:

| Option | Description |
|--------|-------------|
| **Include Configs** | Export configuration files |
| **Include Overrides** | Export override folders |
| **Compress** | Create ZIP archive |

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

### Generate Share Link

1. Open a modpack
2. Click **Share** button
3. Choose **Create Gist**
4. Authenticate with GitHub if needed
5. Copy the generated URL

Recipients can import directly from this URL.

### Direct File Sharing

Export as `.modex` and share via:
- Cloud storage (Google Drive, Dropbox, etc.)
- Discord file upload
- Email attachment

## Backup & Restore

### Manual Backup

Export important modpacks as `.modex` files regularly.

### Automatic Backups

ModEx creates automatic backups:

- Location: `%APPDATA%\modex\backups\`
- Created before major changes
- Kept for 30 days

### Restoring from Backup

1. Go to **Settings > Data**
2. Click **Restore from Backup**
3. Select a backup file
4. Confirm restoration

::: warning
Restoring replaces your current data. Export first if unsure.
:::

## Library Export

Export your entire library (not just one modpack):

1. Go to **Settings > Data**
2. Click **Export Library**
3. Choose format and location
4. All mods and folders are exported

Useful for migrating to a new computer or complete backup.
