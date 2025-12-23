<div align="center">

<img src="docs/public/logo.svg" alt="ModEx Logo" width="128" height="128">

# ModEx

**The Intelligent Mod Library Manager for Minecraft**

[![Release](https://img.shields.io/github/v/release/devfrx/modex?include_prereleases&style=flat-square)](https://github.com/devfrx/modex/releases)
[![Downloads](https://img.shields.io/github/downloads/devfrx/modex/total?style=flat-square)](https://github.com/devfrx/modex/releases)
[![License](https://img.shields.io/github/license/devfrx/modex?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=flat-square)](https://github.com/devfrx/modex/releases)

[Download](https://github.com/devfrx/modex/releases/latest) •
[Documentation](https://devfrx.github.io/modex/) •
[Report Bug](https://github.com/devfrx/modex/issues)

</div>

---

## 📖 About

ModEx is a **metadata-only mod library manager** for Minecraft. Unlike traditional mod managers that download and store JAR files, ModEx stores only references to mods on CurseForge — keeping your library lightweight while providing powerful organization features.

### Why Metadata-Only?

| Traditional Managers | ModEx |
|---------------------|-------|
| Stores JAR files locally | Stores metadata only |
| 5-10 GB for 1000 mods | < 5 MB for 1000 mods |
| Manual backup of large files | Instant JSON backup |
| Duplicate files across modpacks | Single reference, multiple uses |

## ✨ Features

<table>
<tr>
<td width="50%">

### 📚 Mod Library
- Grid, List, and Gallery view modes
- Advanced search & filters
- Favorites and duplicate detection
- Bulk actions support

### 📦 Modpack Management
- Version history with restore
- Multiple profiles per modpack
- Built-in config editor
- Dependency analysis

### 🔍 CurseForge Integration
- In-app browsing and search
- One-click add to library
- Update checking
- Modpack import

### 🗂️ Folder Organization
- Custom folder hierarchies
- Color-coded folders
- Drag-and-drop interface

</td>
<td width="50%">

### 🎯 Visual Sandbox
- Interactive graph visualization
- D3.js + WebGL rendering
- Filter and search nodes
- Performance mode for large libraries

### 📊 Statistics Dashboard
- Interactive Chart.js charts
- Loader/version distribution
- Modpack comparisons
- Customizable colors

### 🎮 Instance Sync
- Auto-detect CurseForge, Prism, MultiMC
- Link modpacks to instances
- Sync mods and configs

### 📤 Import & Export
- CurseForge ZIP format
- Prism/MultiMC format
- Native .modex format
- GitHub Gist sharing

</td>
</tr>
</table>

## 🖥️ Platform Support

| Platform | Status |
|----------|--------|
| Windows 10/11 (64-bit) | ✅ Available |
| macOS (Intel & Apple Silicon) | 🔜 Coming Soon |
| Linux (AppImage) | 🔜 Coming Soon |

## 📥 Installation

### Requirements

- Windows 10 or later (64-bit)
- [CurseForge API Key](https://console.curseforge.com/) (free)
- Internet connection

### Download

1. Go to the [Releases](https://github.com/devfrx/modex/releases/latest) page
2. Download `ModEx-Windows-x.x.x-Setup.exe`
3. Run the installer
4. Launch ModEx and enter your CurseForge API key in Settings

## 🛠️ Development

### Tech Stack

- **Electron 30** — Desktop framework
- **Vue 3** — UI framework with Composition API
- **TypeScript** — Type-safe development
- **Vite** — Build tool
- **Tailwind CSS** — Styling
- **D3.js & PixiJS** — Visualizations
- **Chart.js** — Statistics charts
- **LowDB** — Local JSON database

### Setup

```bash
# Clone the repository
git clone https://github.com/devfrx/modex.git
cd modex

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

### Project Structure

```
modex/
├── electron/          # Electron main process
│   ├── main.ts       # Main entry point
│   └── preload.ts    # Preload scripts
├── src/              # Vue application
│   ├── components/   # Vue components
│   ├── composables/  # Vue composables
│   ├── views/        # Page views
│   └── types/        # TypeScript types
├── docs/             # VitePress documentation
└── public/           # Static assets
```

## 📚 Documentation

Full documentation is available at **[devfrx.github.io/modex](https://devfrx.github.io/modex/)**

- [Getting Started](https://devfrx.github.io/modex/guide/getting-started)
- [Library Guide](https://devfrx.github.io/modex/guide/library)
- [Modpacks Guide](https://devfrx.github.io/modex/guide/modpacks)
- [FAQ](https://devfrx.github.io/modex/guide/faq)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

Copyright © 2025 [devfrx](https://github.com/devfrx)

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [CurseForge](https://curseforge.com/) for the mod platform and API
- [Electron](https://www.electronjs.org/) team
- [Vue.js](https://vuejs.org/) team
- All the amazing mod creators in the Minecraft community

---

<div align="center">

**[⬆ Back to Top](#modex)**

Made with ❤️ by devfrx

</div>
