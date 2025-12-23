# CurseForge Integration

ModEx integrates with CurseForge to browse, search, and fetch mod information.

## API Key Requirement

A CurseForge API key is required for all CurseForge features. See [API Key Setup](/guide/api-key) for instructions.

## Browsing CurseForge

### From Library

1. Go to **Library** view
2. Click the **CurseForge** button (globe icon)
3. The CurseForge browser opens

### Search Options

The browser supports filtering by:

| Filter | Description |
|--------|-------------|
| **Game Version** | Minecraft version |
| **Loader** | Forge, Fabric, NeoForge, Quilt |
| **Category** | Technology, Magic, Storage, etc. |
| **Sort By** | Popularity, Last Updated, Name |

### Adding to Library

1. Browse or search for mods
2. Click **Add to Library** on any result
3. The mod is added as metadata (no download)
4. Find it in your Library

## Modpack Search

When browsing modpacks on CurseForge:

1. Go to **Modpacks** view
2. Click **Browse CurseForge Modpacks**
3. Search and preview modpacks
4. Import complete modpacks to your library

## Update Checking

ModEx can check your library against CurseForge for updates:

1. Go to **Library**
2. Click **Check Updates**
3. ModEx queries each mod for newer versions
4. Results show:
   - Current version
   - Latest available version
   - Compatible game versions

### Selective Updates

The update dialog lets you:
- Select which mods to update
- See changelogs when available
- Update all or individually

## Dependency Awareness

ModEx tracks dependency relationships between mods:

- When removing a mod, you'll be warned if other mods depend on it
- When disabling a mod, dependency impact is shown
- The Health tab in the modpack editor identifies compatibility issues

## Rate Limits

CurseForge has API rate limits. If you encounter issues:

- Wait a few minutes between bulk operations
- Avoid rapid repeated searches
- The status shows in Settings if rate limited

## Troubleshooting

### No Results

- Verify your API key is configured
- Check your internet connection
- Try a simpler search query

### "Mod Not Found"

- The mod may have been removed from CurseForge
- Check if it was renamed
- Try searching by author

### Slow Responses

- CurseForge may be under load
- Try again in a few minutes
- Check [CurseForge Status](https://status.curseforge.com/)
