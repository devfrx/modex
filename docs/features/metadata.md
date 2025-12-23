# Metadata-Only Architecture

ModEx takes a fundamentally different approach to mod management.

## The Problem with Traditional Managers

Traditional mod managers download and store mod JAR files locally:

```
mods/
├── sodium-0.5.8.jar (3.2 MB)
├── lithium-0.12.1.jar (1.4 MB)
├── iris-1.6.17.jar (8.7 MB)
└── ... (hundreds more)
```

This leads to:
- **Storage bloat** — Gigabytes of JAR files
- **Duplicate files** — Same mod in different modpacks
- **Outdated information** — Manual update checks
- **Complex backups** — Large files to sync

## The ModEx Approach

ModEx stores only **metadata** — references to mods on CurseForge:

```json
{
  "id": "abc123",
  "name": "Sodium",
  "curseforgeId": 394468,
  "fileId": 4623626,
  "gameVersion": "1.20.1",
  "loader": "fabric"
}
```

This is typically **less than 1 KB per mod**.

## Benefits

### Lightweight Storage

A library of 1,000 mods takes:
- **Traditional**: ~5-10 GB
- **ModEx**: ~1 MB

### Always Up-to-Date

Mod information is fetched from CurseForge on demand. No stale metadata.

### Instant Backups

Your entire library configuration is a single JSON file. Back up in seconds.

### No Duplicates

Reference the same mod in multiple modpacks without storing multiple copies.

### Fast Operations

Adding, removing, and organizing mods is instant — no file I/O.

## How Exporting Works

When you export a modpack:

1. ModEx creates a manifest with mod references
2. The manifest includes CurseForge project and file IDs
3. Your launcher (CurseForge App, Prism, etc.) downloads the actual files
4. You play with the downloaded mods

This matches how CurseForge modpacks work — the manifest is the source of truth.

## Trade-offs

### Requires Internet

You need an internet connection to:
- Browse CurseForge
- Fetch mod details
- Export for launchers

Your local library database works offline, but exports need connectivity.

### Launcher Required

ModEx doesn't launch Minecraft. You need a separate launcher to actually play.

### CurseForge Only

Currently, only CurseForge mods are supported. Mods not on CurseForge can't be tracked.

## Data Structure

ModEx stores data in LowDB (a lightweight JSON database):

```
%APPDATA%\modex\
├── database.json   # Mods, modpacks, metadata
├── folders.json    # Folder organization
└── settings.json   # User preferences
```

The entire data directory is typically under 5 MB even for large collections.
