/**
 * useModpackPreview - Composable for modpack preview and analysis
 */

import { ref, computed } from "vue";

export interface ModpackAnalysis {
  estimatedRamMin: number;
  estimatedRamRecommended: number;
  estimatedRamMax: number;
  performanceImpact: number;
  loadTimeImpact: number;
  storageImpact: number;
  modCategories?: Record<string, number>;
  warnings: string[];
  recommendations: string[];
  compatibilityScore: number;
  compatibilityNotes: string[];
}

export interface ModpackPreview {
  name: string;
  version: string;
  author?: string;
  description?: string;
  minecraftVersion: string;
  modLoader: string;
  modLoaderVersion?: string;
  modCount: number;
  mods: Array<{
    projectId: number;
    fileId: number;
    name?: string;
    required: boolean;
  }>;
  resourcePackCount: number;
  shaderCount: number;
  analysis: ModpackAnalysis;
  source: "curseforge" | "modrinth" | "modex" | "zip" | "unknown";
  cfProjectId?: number;
  cfFileId?: number;
  mrProjectId?: string;
  overridesCount: number;
  configFilesCount: number;
  totalSize?: number;
}

export function useModpackPreview() {
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const currentPreview = ref<ModpackPreview | null>(null);
  const currentZipPath = ref<string | null>(null);

  // Computed properties for display
  const formattedRam = computed(() => {
    if (!currentPreview.value?.analysis) return null;
    const { estimatedRamMin, estimatedRamRecommended, estimatedRamMax } = currentPreview.value.analysis;
    return {
      min: formatRam(estimatedRamMin),
      recommended: formatRam(estimatedRamRecommended),
      max: formatRam(estimatedRamMax)
    };
  });

  const formattedSize = computed(() => {
    if (!currentPreview.value?.totalSize) return null;
    return formatBytes(currentPreview.value.totalSize);
  });

  const impactLevel = computed(() => {
    if (!currentPreview.value?.analysis) return "unknown";
    const impact = currentPreview.value.analysis.performanceImpact;
    if (impact < 30) return "low";
    if (impact < 60) return "medium";
    if (impact < 80) return "high";
    return "extreme";
  });

  const impactColor = computed(() => {
    const colors: Record<string, string> = {
      low: "text-green-500",
      medium: "text-yellow-500",
      high: "text-orange-500",
      extreme: "text-red-500",
      unknown: "text-gray-500"
    };
    return colors[impactLevel.value];
  });

  /**
   * Preview a modpack from a local zip file
   */
  async function previewFromZip(zipPath: string): Promise<ModpackPreview | null> {
    isLoading.value = true;
    error.value = null;
    
    try {
      const preview = await window.api.preview.fromZip(zipPath);
      if (preview) {
        currentPreview.value = preview;
        currentZipPath.value = zipPath;
      } else {
        error.value = "Could not parse modpack. Invalid or unsupported format.";
      }
      return preview;
    } catch (e: any) {
      error.value = e.message || "Failed to preview modpack";
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Open file picker and preview selected modpack
   */
  async function selectAndPreview(): Promise<{ path: string; preview: ModpackPreview } | null> {
    isLoading.value = true;
    error.value = null;
    
    try {
      const result = await window.api.preview.selectAndPreview();
      if (result?.preview) {
        currentPreview.value = result.preview;
        currentZipPath.value = result.path;
        return result;
      }
      return null;
    } catch (e: any) {
      error.value = e.message || "Failed to select modpack";
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Preview a modpack from CurseForge data (before download)
   */
  async function previewFromCurseForge(
    modpackData: any,
    fileData: any
  ): Promise<ModpackPreview | null> {
    isLoading.value = true;
    error.value = null;
    
    try {
      const preview = await window.api.preview.fromCurseForge(modpackData, fileData);
      if (preview) {
        currentPreview.value = preview;
        currentZipPath.value = null;
      }
      return preview;
    } catch (e: any) {
      error.value = e.message || "Failed to preview modpack";
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Analyze an existing modpack
   */
  async function analyzeModpack(modpackId: string): Promise<ModpackAnalysis | null> {
    isLoading.value = true;
    error.value = null;
    
    try {
      const analysis = await window.api.preview.analyzeModpack(modpackId);
      return analysis;
    } catch (e: any) {
      error.value = e.message || "Failed to analyze modpack";
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Clear current preview
   */
  function clearPreview(): void {
    currentPreview.value = null;
    currentZipPath.value = null;
    error.value = null;
  }

  // Utility functions
  function formatRam(mb: number): string {
    if (mb < 1024) return `${mb} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function getImpactIcon(level: string): string {
    const icons: Record<string, string> = {
      low: "🟢",
      medium: "🟡",
      high: "🟠",
      extreme: "🔴",
      unknown: "⚪"
    };
    return icons[level] || "⚪";
  }

  function getLoaderIcon(loader: string): string {
    const icons: Record<string, string> = {
      forge: "🔥",
      fabric: "🧵",
      neoforge: "⚡",
      quilt: "🧶"
    };
    return icons[loader.toLowerCase()] || "📦";
  }

  return {
    // State
    isLoading,
    error,
    currentPreview,
    currentZipPath,
    
    // Computed
    formattedRam,
    formattedSize,
    impactLevel,
    impactColor,
    
    // Methods
    previewFromZip,
    selectAndPreview,
    previewFromCurseForge,
    analyzeModpack,
    clearPreview,
    
    // Utilities
    formatRam,
    formatBytes,
    getImpactIcon,
    getLoaderIcon
  };
}
