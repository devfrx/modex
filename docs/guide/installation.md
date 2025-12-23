# Installation

## System Requirements

- **Operating System**: Windows 10 or later
- **Memory**: 4 GB RAM minimum (8 GB recommended)
- **Storage**: 100 MB for the application
- **Network**: Internet connection required for CurseForge integration

## Download

1. Go to the [GitHub Releases](https://github.com/devfrx/modex/releases) page
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
%APPDATA%\modex\modex\
├── library.json     # Your mod library
├── config.json      # API keys and settings
├── modpacks/        # Individual modpack files
├── versions/        # Version history
└── cache/           # Thumbnail cache
```

## Uninstallation

### Windows

1. Open **Settings > Apps > Installed Apps**
2. Find **ModEx**
3. Click **Uninstall**

Your data in `%APPDATA%\modex` is preserved. To completely remove all data, manually delete that folder.
