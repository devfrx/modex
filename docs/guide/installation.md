# Installation

## System Requirements

- **Operating System**: Windows 10 or later
- **Memory**: 4 GB RAM minimum (8 GB recommended)
- **Storage**: 100 MB for the application
- **Network**: Internet connection required for CurseForge integration

## Download

1. Go to the [GitHub Releases](https://github.com/your-username/modex/releases) page
2. Download the latest `.exe` installer for Windows

## Windows Installation

### Using the Installer

1. Run the downloaded `ModEx-Setup-x.x.x.exe`
2. Follow the installation wizard
3. Choose your installation location (default: `C:\Users\{username}\AppData\Local\Programs\ModEx`)
4. Optionally create a desktop shortcut
5. Click **Install**

### First Launch

When you launch ModEx for the first time:

1. The app will create its data directory at `%APPDATA%\modex`
2. You'll be prompted to enter your CurseForge API key
3. Once configured, you can start browsing mods

## Data Storage

ModEx stores its data in:

```
%APPDATA%\modex\
├── database.json    # Your library and modpacks
├── folders.json     # Folder organization
├── settings.json    # App settings
└── backups/         # Automatic backups
```

## Updating

ModEx includes an auto-update feature:

1. When a new version is available, you'll see a notification
2. Click **Update** to download and install
3. The app will restart with the new version

You can also manually check for updates in **Settings > General > Check for Updates**.

## Uninstallation

### Windows

1. Open **Settings > Apps > Installed Apps**
2. Find **ModEx**
3. Click **Uninstall**

Your data in `%APPDATA%\modex` is preserved. To completely remove all data, manually delete that folder.
