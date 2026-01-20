import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "ModEx",
  description: "The intelligent mod library manager for Minecraft",
  
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#ffffff' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'ModEx - Minecraft Mod Manager' }],
    ['meta', { property: 'og:description', content: 'The intelligent mod library manager for Minecraft' }],
  ],

  themeConfig: {
    logo: '/modex_logo.png',
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Features', link: '/features/' },
      { text: 'Download', link: '/download' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'API Key Setup', link: '/guide/api-key' }
          ]
        },
        {
          text: 'Core Features',
          items: [
            { text: 'Library', link: '/guide/library' },
            { text: 'Modpacks', link: '/guide/modpacks' },
            { text: 'CurseForge Integration', link: '/guide/curseforge' },
            { text: 'Game Instances', link: '/guide/instances' }
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Import & Export', link: '/guide/import-export' }
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'Keyboard Shortcuts', link: '/guide/shortcuts' },
            { text: 'Settings', link: '/guide/settings' },
            { text: 'FAQ', link: '/guide/faq' }
          ]
        }
      ],
      '/features/': [
        {
          text: 'Features',
          items: [
            { text: 'Overview', link: '/features/' },
            { text: 'Metadata Architecture', link: '/features/metadata' },
            { text: 'Version Control', link: '/features/versioning' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/devfrx/modex' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-2026 ModEx'
    },

    search: {
      provider: 'local'
    }
  }
})
