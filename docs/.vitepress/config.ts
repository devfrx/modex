import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "ModEx",
  description: "The intelligent mod library manager for Minecraft",
  
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#8b5cf6' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'ModEx - Minecraft Mod Manager' }],
    ['meta', { property: 'og:description', content: 'The intelligent mod library manager for Minecraft' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    
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
            { text: 'Organize', link: '/guide/organize' },
            { text: 'Sandbox', link: '/guide/sandbox' }
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'CurseForge Integration', link: '/guide/curseforge' },
            { text: 'Game Instances', link: '/guide/instances' },
            { text: 'Import & Export', link: '/guide/import-export' },
            { text: 'Statistics', link: '/guide/statistics' }
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
            { text: 'Version Control', link: '/features/versioning' },
            { text: 'Visual Sandbox', link: '/features/sandbox' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/your-username/modex' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024 ModEx'
    },

    search: {
      provider: 'local'
    }
  }
})
