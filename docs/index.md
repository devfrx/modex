---
layout: home

hero:
  name: "ModEx"
  text: "Intelligent Mod Library Manager"
  tagline: Organize, manage, and explore your Minecraft mods with a modern metadata-only architecture
  image:
    src: /hero-image.svg
    alt: ModEx
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/devfrx/modex

features:
  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>'
    title: Mod Library
    details: Centralized library for all your mods, resource packs, and shaders. Search, filter, and organize with favorites and folder structures.
    
  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>'
    title: Modpack Management
    details: Create and manage modpacks with version history and profiles. Export to CurseForge format for any launcher.
    
  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>'
    title: CurseForge Integration
    details: Browse and search CurseForge directly within the app. Check for mod updates and dependency analysis.
    
  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M2 10h20"/></svg>'
    title: Folder Organization
    details: Create custom folder hierarchies to organize your mods. Drag-and-drop interface with color-coded folders.
    
  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>'
    title: Visual Sandbox
    details: Interactive graph visualization of your mod library and modpacks using D3.js and WebGL. See relationships and connections at a glance.
    
  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>'
    title: Statistics Dashboard
    details: View insights about your library with customizable charts. Track mod counts, loader distribution, and modpack sizes.
    
  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
    title: Metadata-Only Architecture
    details: Lightweight storage using mod references instead of JAR files. Your library stays small and always synced with CurseForge.
    
  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>'
    title: Instance Sync
    details: Sync modpacks with your game instances from popular launchers. Deploy configurations directly to your Minecraft installations.
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #8b5cf6 30%, #a855f7);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #8b5cf6 50%, #a855f7 50%);
  --vp-home-hero-image-filter: blur(44px);
}

@media (min-width: 640px) {
  :root {
    --vp-home-hero-image-filter: blur(56px);
  }
}

@media (min-width: 960px) {
  :root {
    --vp-home-hero-image-filter: blur(68px);
  }
}
</style>

## Why ModEx?

ModEx takes a different approach to mod management. Instead of downloading and storing JAR files locally, ModEx works with **metadata only** — storing references to mods on CurseForge.

This means:

- **Lightweight storage** — Your library can contain thousands of mods without filling your disk
- **Always up-to-date** — Mod information is fetched directly from CurseForge
- **Easy backups** — Your entire library configuration is a small JSON file
- **Quick exports** — Generate modpacks for any launcher in seconds

<div class="tip custom-block" style="padding-top: 8px">
  Ready to get started? Head to the <a href="/guide/getting-started">Getting Started</a> guide.
</div>

## Built With Modern Tech

ModEx is built with a modern technology stack for a fast, responsive experience:

- **Electron** — Cross-platform desktop application
- **Vue 3** — Reactive UI with Composition API
- **TypeScript** — Type-safe development
- **Tailwind CSS** — Modern styling
- **D3.js & PixiJS** — Interactive visualizations
- **LowDB** — Lightweight local database
