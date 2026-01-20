# Download ModEx

<script setup>
import { ref, onMounted } from 'vue'

const downloadCount = ref(null)
const latestVersion = ref(null)
const releaseDate = ref(null)
const downloadUrl = ref('https://github.com/devfrx/modex/releases/latest')
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await fetch('https://api.github.com/repos/devfrx/modex/releases/latest')
    if (res.ok) {
      const data = await res.json()
      latestVersion.value = data.tag_name
      releaseDate.value = new Date(data.published_at).toLocaleDateString()
      
      // Calcola download totali per questa release
      let total = 0
      for (const asset of data.assets) {
        total += asset.download_count
        // Trova il setup Windows
        if (asset.name.endsWith('.exe') && asset.name.includes('Setup')) {
          downloadUrl.value = asset.browser_download_url
        }
      }
      downloadCount.value = total
    }
  } catch (e) {
    console.error('Failed to fetch release info:', e)
  } finally {
    loading.value = false
  }
})
</script>

## Platform Support

<div class="platform-grid">
  <div class="platform-card supported">
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
    <h3>Windows</h3>
    <span class="badge available">Disponibile</span>
    <p>Windows 10/11 (64-bit)</p>
  </div>
  
  <div class="platform-card">
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
    <h3>macOS</h3>
    <span class="badge coming-soon">Prossimamente</span>
    <p>macOS 11+ (Intel & Apple Silicon)</p>
  </div>
  
  <div class="platform-card">
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139z"/>
    </svg>
    <h3>Linux</h3>
    <span class="badge coming-soon">Prossimamente</span>
    <p>Ubuntu, Fedora, Arch (AppImage)</p>
  </div>
</div>

## Download per Windows

<div class="download-section">
  <a :href="downloadUrl" class="download-button">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" x2="12" y1="15" y2="3"/>
    </svg>
    Download ModEx per Windows
  </a>
  
  <div class="release-info" v-if="!loading">
    <div class="info-item" v-if="latestVersion">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      <span>Versione: <strong>{{ latestVersion }}</strong></span>
    </div>
    <div class="info-item" v-if="downloadCount !== null">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
      <span>Download: <strong>{{ downloadCount.toLocaleString() }}</strong></span>
    </div>
    <div class="info-item" v-if="releaseDate">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
      <span>Data: <strong>{{ releaseDate }}</strong></span>
    </div>
  </div>
  <div class="release-info" v-else>
    <span class="loading">Caricamento informazioni release...</span>
  </div>
</div>

<a href="https://github.com/devfrx/modex/releases" class="all-releases-link">
  Vedi tutte le release →
</a>

## Requisiti di Sistema

| Requisito | Minimo | Consigliato |
|-----------|--------|-------------|
| **Sistema Operativo** | Windows 10 (64-bit) | Windows 11 |
| **RAM** | 4 GB | 8 GB |
| **Spazio Disco** | 100 MB | 200 MB |
| **Connessione** | Internet richiesta | Banda larga |

::: info Nota
È richiesta una **CurseForge API Key** (gratuita) per utilizzare ModEx. [Ottienila qui](https://console.curseforge.com/)
:::

## Installazione

1. Scarica il file `.exe` dal pulsante sopra
2. Esegui l'installer e segui le istruzioni
3. Avvia ModEx dal menu Start o dal desktop
4. Al primo avvio, inserisci la tua CurseForge API Key nelle Impostazioni

::: warning Avviso Windows SmartScreen
Al primo avvio potresti vedere il messaggio **"Windows ha protetto il tuo PC"**.

Questo avviso appare perché ModEx non dispone ancora di un certificato di firma digitale EV (Extended Validation). L'applicazione è sicura — il codice sorgente è disponibile su GitHub.

**Per procedere:**
1. Clicca su **"Maggiori informazioni"**
2. Clicca su **"Esegui comunque"**
:::

## Verifica Download

Ogni release include checksum SHA256 per verificare l'integrità:

```powershell
Get-FileHash ModEx-Setup-x.x.x.exe -Algorithm SHA256
```

Confronta il risultato con il checksum pubblicato nella pagina releases.

## Prossime Piattaforme

<div class="roadmap">
  <div class="roadmap-item">
    <span class="roadmap-status planned">Pianificato</span>
    <strong>macOS</strong> — Build per Intel e Apple Silicon
  </div>
  <div class="roadmap-item">
    <span class="roadmap-status planned">Pianificato</span>
    <strong>Linux</strong> — AppImage e pacchetti .deb/.rpm
  </div>
</div>

<style>
.platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin: 2rem 0;
}

.platform-card {
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  text-align: center;
  opacity: 0.7;
}

.platform-card.supported {
  opacity: 1;
  border-color: rgba(255, 255, 255, 0.5);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
}

.platform-card svg {
  margin-bottom: 0.5rem;
  color: var(--vp-c-text-2);
}

.platform-card.supported svg {
  color: #ffffff;
}

.platform-card h3 {
  margin: 0.5rem 0;
}

.platform-card p {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  margin: 0;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge.available {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.badge.coming-soon {
  background: rgba(234, 179, 8, 0.2);
  color: #eab308;
}

.download-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  margin: 2rem 0;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.download-button {
  display: inline-flex;
  align-items: center;
  padding: 1rem 2rem;
  background: linear-gradient(135deg, #ffffff, #e5e5e5);
  color: #0c0c0e !important;
  font-weight: 600;
  font-size: 1.1rem;
  border-radius: 10px;
  text-decoration: none !important;
  transition: transform 0.2s, box-shadow 0.2s;
}

.download-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(255, 255, 255, 0.2);
}

.release-info {
  display: flex;
  gap: 1.5rem;
  margin-top: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.info-item svg {
  color: var(--vp-c-text-3);
}

.loading {
  color: var(--vp-c-text-3);
  font-style: italic;
}

.all-releases-link {
  display: block;
  text-align: center;
  margin: 1rem 0 2rem;
  color: var(--vp-c-brand-1);
}

.roadmap {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 1rem 0;
}

.roadmap-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.roadmap-status {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.roadmap-status.planned {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}
</style>
