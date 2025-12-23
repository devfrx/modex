# FAQ

Frequently asked questions about ModEx.

## General

### What is ModEx?

ModEx is a **metadata-only mod library manager** for Minecraft. It stores references to mods on CurseForge rather than downloading the actual JAR files. This keeps your library lightweight while providing powerful organization features.

### Where are my mods stored?

ModEx stores only metadata — not actual mod files. The metadata is saved in:
```
%APPDATA%\modex\modex\library.json
```

When you export a modpack, the launcher you import into handles downloading the actual mod files.

### Do I need a CurseForge API key?

Yes. ModEx requires a CurseForge API key to:
- Browse and search mods
- Fetch mod information
- Check for updates

Get a free key at [console.curseforge.com](https://console.curseforge.com/).

## Playing with Mods

### How do I play with my modpack?

1. Create and configure your modpack in ModEx
2. Click **Export** and choose your launcher format
3. Import the exported file into CurseForge App, Prism Launcher, or MultiMC
4. Launch from that application

### Why doesn't ModEx download mods?

By design. ModEx focuses on **organization and metadata management**. Benefits:
- Lightweight storage
- No duplicate files
- Always up-to-date information
- Works with any launcher

### Can I launch Minecraft from ModEx?

Not directly. ModEx is a library manager, not a launcher. Export your modpack to your preferred launcher for playing.

## Mod Sources

### Can I use mods from Modrinth?

No. ModEx currently only supports CurseForge. Modrinth support is not planned at this time.

### Can I add local mods not on CurseForge?

ModEx is designed for CurseForge mods. Local-only mods cannot be tracked since there's no metadata source.

## Library vs Modpacks

### What's the difference?

- **Library** — Your complete collection of all mods, like a pantry
- **Modpacks** — Curated subsets for specific setups, like recipes

You can use the same mod in multiple modpacks.

### Can a mod be in multiple modpacks?

Yes! Mods in your library can be added to any number of modpacks.

## Data & Backup

### How do I back up my library?

Manually copy the modex data folder:
```
%APPDATA%\modex\modex\
```

This includes `library.json` (your mods) and the `modpacks/` folder.
You can also export individual modpacks as `.modex` files via the Share button.

### I lost my data. Can I recover it?

If you have a backup of the `modex` data folder, you can restore it by copying it back to `%APPDATA%\modex\`.

For modpack configs, backups are stored in the instance's `.config-backups` folder.

### Can I sync across computers?

Export your library as a `.modex` file and import on the other computer. Cloud sync of the data folder is not officially supported.

## Troubleshooting

### ModEx is slow to start

- Large libraries take time to load
- First startup after update may be slower
- Check if antivirus is scanning

### Search returns no results

- Verify your CurseForge API key is configured
- Check your internet connection
- Try a simpler search query

### Mods show "Update Available" but won't update

- The update may not be compatible with your game version
- Check loader compatibility
- Some mods restrict file visibility

### Export fails

- Check write permissions in the destination folder
- Ensure disk space is available
- Try a different export location

## Feature Requests

### Will you add [feature]?

Check the GitHub issues for existing requests or submit a new one. Popular requests are considered for future versions.

### Is ModEx open source?

Check the GitHub repository for licensing information.
