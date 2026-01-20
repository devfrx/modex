<script setup lang="ts">
import { useData } from 'vitepress'
import modexLogo from './assets/modex_logo_h2_nobg.png'

const { isDark } = useData()
</script>

<template>
    <div class="landing-page">
        <!-- Hero Section -->
        <section class="hero">
            <div class="hero-content">
                <div class="hero-logo">
                    <img :src="modexLogo" alt="ModEx Logo" class="logo-image" />
                </div>
                <h1 class="hero-title">
                    <span class="gradient-text">ModEx</span>
                </h1>
                <p class="hero-subtitle">The Modern Minecraft Mod Manager</p>
                <p class="hero-description">
                    Lightweight. Powerful. Metadata-first architecture that keeps your library in sync with CurseForge.
                </p>
                <div class="hero-actions">
                    <a href="/guide/getting-started" class="btn btn-primary">
                        Get Started
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14" />
                            <path d="m12 5 7 7-7 7" />
                        </svg>
                    </a>
                    <a href="/download" class="btn btn-secondary">
                        Download
                    </a>
                </div>
            </div>
            <div class="hero-glow"></div>
        </section>

        <!-- Features Section -->
        <section class="features">
            <div class="section-header">
                <span class="badge">Features</span>
                <h2>Everything you need to manage mods</h2>
                <p>A complete toolkit for organizing, exploring, and deploying your Minecraft mod collection.</p>
            </div>

            <div class="features-grid">
                <div class="feature-card">
                    <div class="feature-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                        </svg>
                    </div>
                    <h3>Mod Library</h3>
                    <p>Centralized hub for mods, resource packs, and shaders. Grid, list, gallery & compact views with
                        advanced filtering.</p>
                </div>

                <div class="feature-card">
                    <div class="feature-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <path
                                d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <polyline points="3.29 7 12 12 20.71 7" />
                            <line x1="12" x2="12" y1="22" y2="12" />
                        </svg>
                    </div>
                    <h3>Modpack Management</h3>
                    <p>Create modpacks with built-in version control. Track changes, create versions, and revert when
                        needed.</p>
                </div>

                <div class="feature-card">
                    <div class="feature-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.3-4.3" />
                        </svg>
                    </div>
                    <h3>CurseForge Integration</h3>
                    <p>Browse and search CurseForge directly. Add mods to library or modpacks with one click.</p>
                </div>

                <div class="feature-card">
                    <div class="feature-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10" />
                            <polygon points="10 8 16 12 10 16 10 8" />
                        </svg>
                    </div>
                    <h3>Instance & Launch</h3>
                    <p>Create isolated game instances with custom RAM settings. Sync mods, launch games, and view live
                        logs.</p>
                </div>

                <div class="feature-card">
                    <div class="feature-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                            <polyline points="14 2 14 8 20 8" />
                            <path d="M12 18v-6" />
                            <path d="M9 15l3 3 3-3" />
                        </svg>
                    </div>
                    <h3>Config Management</h3>
                    <p>Browse and edit config files with a structured editor. Backup, restore, and sync configs between
                        instances.</p>
                </div>

                <div class="feature-card">
                    <div class="feature-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                    </div>
                    <h3>Remote Sync</h3>
                    <p>Publish modpacks to GitHub Gist. Subscribe to remote modpacks and sync updates with conflict
                        resolution.</p>
                </div>
            </div>
        </section>

        <!-- Stats Section -->
        <section class="stats">
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-number">&lt;5MB</span>
                    <span class="stat-label">Library Size</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">∞</span>
                    <span class="stat-label">Mod Capacity</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">1-Click</span>
                    <span class="stat-label">Export</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">100%</span>
                    <span class="stat-label">Free & Open</span>
                </div>
            </div>
        </section>

        <!-- Why Section -->
        <section class="why">
            <h2>Why Metadata-Only?</h2>
            <div class="why-grid">
                <div class="why-item">
                    <div class="why-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </div>
                    <div class="why-content">
                        <strong>Lightweight storage</strong>
                        <p>Your library stays under 5MB even with thousands of mods</p>
                    </div>
                </div>
                <div class="why-item">
                    <div class="why-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </div>
                    <div class="why-content">
                        <strong>Always up-to-date</strong>
                        <p>Mod information synced directly from CurseForge</p>
                    </div>
                </div>
                <div class="why-item">
                    <div class="why-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </div>
                    <div class="why-content">
                        <strong>Easy backups</strong>
                        <p>Your entire library is a small JSON file</p>
                    </div>
                </div>
                <div class="why-item">
                    <div class="why-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </div>
                    <div class="why-content">
                        <strong>Instant exports</strong>
                        <p>Generate modpacks for any launcher in seconds</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- CTA Section -->
        <section class="cta">
            <h2>Ready to organize your mods?</h2>
            <p>Get started with ModEx and experience a new way to manage your Minecraft mod collection.</p>
            <div class="cta-buttons">
                <a href="/guide/getting-started" class="btn btn-primary">
                    Get Started
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2">
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                    </svg>
                </a>
                <a href="https://github.com/devfrx/modex" class="btn btn-secondary" target="_blank">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                        fill="currentColor">
                        <path
                            d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    GitHub
                </a>
            </div>
        </section>

        <!-- Tech Section -->
        <section class="tech">
            <div class="tech-grid">
                <span class="tech-item">Electron</span>
                <span class="tech-item">Vue 3</span>
                <span class="tech-item">TypeScript</span>
                <span class="tech-item">Tailwind CSS</span>
            </div>
        </section>
    </div>
</template>

<style scoped>
.landing-page {
    min-height: 100vh;
}

/* Hero */
.hero {
    position: relative;
    padding: 120px 24px 80px;
    text-align: center;
    overflow: hidden;
}

.hero-content {
    position: relative;
    z-index: 1;
    max-width: 800px;
    margin: 0 auto;
}

.hero-logo {
    margin-bottom: 24px;
    display: flex;
    justify-content: center;
}

.logo-image {
    width: 120px;
    height: auto;
    filter: drop-shadow(0 0 30px rgba(255, 255, 255, 0.2));
}

.hero-title {
    font-size: clamp(3rem, 8vw, 5rem);
    font-weight: 800;
    margin: 0 0 16px;
    line-height: 1;
}

.gradient-text {
    background: linear-gradient(135deg, #ffffff 0%, #e5e5e5 50%, #ffffff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.hero-subtitle {
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 600;
    margin: 0 0 16px;
    color: var(--vp-c-text-1);
}

.hero-description {
    font-size: 1.1rem;
    color: var(--vp-c-text-2);
    margin: 0 auto 32px;
    max-width: 500px;
    line-height: 1.6;
}

.hero-actions {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
}

.hero-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, transparent 70%);
    pointer-events: none;
}

/* Buttons */
.btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    text-decoration: none;
    transition: all 0.2s ease;
}

.btn-primary {
    background: linear-gradient(135deg, #ffffff, #e5e5e5);
    color: #0c0c0e !important;
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 30px -10px rgba(255, 255, 255, 0.3);
}

.btn-secondary {
    background: var(--vp-c-bg-soft);
    color: var(--vp-c-text-1) !important;
    border: 1px solid var(--vp-c-divider);
}

.btn-secondary:hover {
    border-color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.1);
}

/* Section Header */
.section-header {
    text-align: center;
    margin-bottom: 48px;
}

.badge {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 16px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
}

.section-header h2 {
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 12px;
    color: var(--vp-c-text-1);
}

.section-header p {
    font-size: 1.1rem;
    color: var(--vp-c-text-2);
    margin: 0;
}

/* Features */
.features {
    padding: 80px 24px;
    max-width: 1200px;
    margin: 0 auto;
}

.features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 24px;
}

.feature-card {
    padding: 28px;
    border-radius: 16px;
    background: var(--vp-c-bg-soft);
    border: 1px solid var(--vp-c-divider);
    transition: all 0.2s ease;
}

.feature-card:hover {
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-4px);
    box-shadow: 0 20px 40px -20px rgba(255, 255, 255, 0.1);
}

.feature-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #ffffff;
}

.feature-card h3 {
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0 0 8px;
    color: var(--vp-c-text-1);
}

.feature-card p {
    font-size: 0.95rem;
    color: var(--vp-c-text-2);
    margin: 0;
    line-height: 1.6;
}

/* Stats */
.stats {
    padding: 60px 24px;
    border-top: 1px solid var(--vp-c-divider);
    border-bottom: 1px solid var(--vp-c-divider);
    background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.02), transparent);
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;
    max-width: 1000px;
    margin: 0 auto;
    text-align: center;
}

@media (max-width: 640px) {
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

.stat-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.stat-number {
    font-size: 2.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, #ffffff, #e5e5e5);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.2;
}

.stat-label {
    font-size: 0.85rem;
    color: var(--vp-c-text-2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

/* Why */
.why {
    padding: 80px 24px;
    max-width: 900px;
    margin: 0 auto;
}

.why h2 {
    font-size: 1.8rem;
    font-weight: 600;
    margin: 0 0 40px;
    text-align: center;
    color: var(--vp-c-text-1);
}

.why-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
}

@media (max-width: 640px) {
    .why-grid {
        grid-template-columns: 1fr;
    }
}

.why-item {
    display: flex;
    gap: 14px;
    padding: 20px;
    border-radius: 12px;
    background: var(--vp-c-bg-soft);
    border: 1px solid var(--vp-c-divider);
    transition: all 0.2s ease;
}

.why-item:hover {
    border-color: rgba(255, 255, 255, 0.2);
}

.why-icon {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
}

.why-content strong {
    display: block;
    color: var(--vp-c-text-1);
    margin-bottom: 4px;
}

.why-content p {
    margin: 0;
    font-size: 0.9rem;
    color: var(--vp-c-text-2);
    line-height: 1.5;
}

/* CTA */
.cta {
    padding: 80px 24px;
    text-align: center;
    border-top: 1px solid var(--vp-c-divider);
}

.cta h2 {
    font-size: 1.8rem;
    font-weight: 600;
    margin: 0 0 12px;
    color: var(--vp-c-text-1);
}

.cta>p {
    font-size: 1.1rem;
    color: var(--vp-c-text-2);
    margin: 0 auto 32px;
    max-width: 500px;
}

.cta-buttons {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
}

/* Tech */
.tech {
    padding: 40px 24px 60px;
    border-top: 1px solid var(--vp-c-divider);
}

.tech-grid {
    display: flex;
    justify-content: center;
    gap: 24px;
    flex-wrap: wrap;
}

.tech-item {
    font-size: 0.9rem;
    color: var(--vp-c-text-2);
    padding: 6px 14px;
    border-radius: 6px;
    background: var(--vp-c-bg-soft);
    border: 1px solid var(--vp-c-divider);
}
</style>
