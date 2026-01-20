# Getting Started

Welcome to ModEx! This guide will help you set up and start using ModEx to manage your Minecraft mods.

## What is ModEx?

ModEx is a **metadata-only mod library manager** for Minecraft. Unlike traditional mod managers that download and store JAR files, ModEx stores only the metadata (references) to mods on CurseForge. This approach keeps your library lightweight while providing powerful organization features.

## Key Concepts

### Metadata-Only Architecture

ModEx doesn't store actual mod files. Instead, it stores:
- Mod name, author, and description
- CurseForge ID and file ID
- Game version and loader compatibility
- Your organization (folders, favorites, modpacks)

When you want to play, you **export** your modpack to a format compatible with your favorite launcher (CurseForge App, Prism Launcher, MultiMC).

### Library vs Modpacks

- **Library**: Your global collection of all mods, resource packs, and shaders
- **Modpacks**: Curated subsets of your library for specific game setups

Think of the Library as your pantry and Modpacks as your recipes.

## First Steps

### 1. Get a CurseForge API Key

ModEx requires a CurseForge API key to browse and fetch mod information.

1. Go to [CurseForge Console](https://console.curseforge.com/)
2. Sign in or create an account
3. Create a new project/API key
4. Copy the API key

### 2. Configure ModEx

1. Open ModEx
2. Go to **Settings** (gear icon in sidebar)
3. In the **General** tab, find **API Configuration**
4. Paste your CurseForge API key
5. Click **Save**

### 3. Browse CurseForge

1. Go to **Library** view
2. Click the **CurseForge** button in the toolbar
3. Search for mods, resource packs, or shaders
4. Click **Add to Library** on any mod you want

### 4. Create Your First Modpack

1. Go to **Modpacks** view
2. Click **Create Modpack**
3. Enter a name and select game version + loader
4. Add mods from your library
5. Check the **Health** tab to identify any compatibility issues

### 5. Export and Play

1. Open your modpack
2. Click **Export** or **Share**
3. Choose your export format:
   - **CurseForge** (.zip) for any launcher (CurseForge App, Prism, MultiMC)
   - **MODEX** (.modex) for backup/sharing with other ModEx users
4. Import the exported file into your launcher
5. Play!

## Next Steps

- [Library Guide](/guide/library) — Learn about search, filters, and favorites
- [Modpacks Guide](/guide/modpacks) — Master modpack creation and version control
- [CurseForge Integration](/guide/curseforge) — Browse and add mods
- [Keyboard Shortcuts](/guide/shortcuts) — Speed up your workflow
