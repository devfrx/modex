<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import {
  X,
  ExternalLink,
  Download,
  Calendar,
  User,
  Tag,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Image as ImageIcon,
  FileText,
  Layers,
  Sparkles,
  Package,
  Check,
  Info,
  AlertTriangle,
  RefreshCw,
  Clock,
  HardDrive,
  Globe,
  ArrowLeft,
  Lock,
} from "lucide-vue-next";
import type { Mod } from "@/types";
import { useToast } from "@/composables/useToast";

const props = defineProps<{
  open: boolean;
  mod: Mod | null;
  // Context for filtering files/versions
  context?: {
    type: "library" | "modpack" | "browse";
    modpackId?: string;
    gameVersion?: string;
    loader?: string;
  };
  // Current installed version info (for modpack context)
  currentFileId?: number;
  // Full screen mode
  fullScreen?: boolean;
  // Whether the mod is locked (prevents version changes)
  isLocked?: boolean;
  // Whether the modpack is readonly/linked (prevents any modifications)
  readonly?: boolean;
  // Hide files tab (for browse context where you can't download)
  hideFilesTab?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "version-changed", fileId: number): void;
}>();

const toast = useToast();

// State
const activeTab = ref<"description" | "gallery" | "files">("description");
const isLoadingDescription = ref(false);
const isLoadingGallery = ref(false);
const isLoadingFiles = ref(false);
const isChangingVersion = ref(false);

// Header collapse state
const isHeaderCollapsed = ref(false);
const scrollContainerRef = ref<HTMLElement | null>(null);
const lastScrollTop = ref(0);
const scrollThreshold = 50; // Tolerance for scroll direction detection

// Data
const description = ref<string>("");
const screenshots = ref<Array<{ id: number; title: string; description: string; thumbnailUrl: string; url: string }>>([]);
const files = ref<any[]>([]);
const cfModData = ref<any>(null);

// Gallery state
const selectedScreenshotIndex = ref(0);
const showLightbox = ref(false);

// Files filter
const filterRelease = ref(true);
const filterBeta = ref(false);
const filterAlpha = ref(false);
const selectedFileId = ref<number | null>(null);
const filterGameVersion = ref<string>("all");
const filterLoader = ref<string>("all");

// Computed
const isModContext = computed(() => props.mod?.content_type === "mod" || !props.mod?.content_type);
const canChangeVersion = computed(() => props.context?.type === "modpack" && !props.isLocked && !props.readonly);
const isReadonly = computed(() => props.isLocked || props.readonly);

// Available tabs based on hideFilesTab prop
const availableTabs = computed(() => {
  return props.hideFilesTab
    ? ['description', 'gallery'] as const
    : ['description', 'gallery', 'files'] as const;
});

// Helper to extract displayable version tags from a file's gameVersions
const getFileVersionTags = (gameVersions: string[] | undefined): string[] => {
  const knownLoaders = ['Forge', 'Fabric', 'NeoForge', 'Quilt'];
  return (gameVersions || [])
    .filter(v => /^1\.\d+/.test(v) || knownLoaders.includes(v))
    .slice(0, 5);
};

// Available game versions from loaded files
const availableGameVersions = computed(() => {
  const versions = new Set<string>();
  files.value.forEach((f) => {
    (f.gameVersions || []).forEach((gv: string) => {
      if (/^1\.\d+(\.\d+)?$/.test(gv)) {
        versions.add(gv);
      }
    });
  });
  return Array.from(versions).sort((a, b) => {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const diff = (bParts[i] || 0) - (aParts[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
});

// Available loaders from loaded files
const availableLoaders = computed(() => {
  const loaders = new Set<string>();
  const knownLoaders = ['Forge', 'Fabric', 'NeoForge', 'Quilt'];
  files.value.forEach((f) => {
    (f.gameVersions || []).forEach((gv: string) => {
      if (knownLoaders.includes(gv)) {
        loaders.add(gv);
      }
    });
  });
  return Array.from(loaders).sort();
});

const filteredFiles = computed(() => {
  return files.value.filter((f) => {
    // Filter by release type
    if (f.releaseType === 1 && !filterRelease.value) return false;
    if (f.releaseType === 2 && !filterBeta.value) return false;
    if (f.releaseType === 3 && !filterAlpha.value) return false;

    const fileVersions = f.gameVersions || [];

    // If in modpack context, filter by game version and loader from modpack
    if (props.context?.type === "modpack") {
      // Filter by game version
      if (props.context.gameVersion) {
        const hasMatchingVersion = fileVersions.some(
          (gv: string) =>
            gv === props.context!.gameVersion ||
            gv.startsWith(props.context!.gameVersion + ".") ||
            props.context!.gameVersion?.startsWith(gv + ".")
        );
        if (!hasMatchingVersion) return false;
      }

      // Filter by loader (only for mods)
      if (isModContext.value && props.context.loader) {
        const loaderLower = props.context.loader.toLowerCase();
        const fileLoaders = fileVersions.map((gv: string) => gv.toLowerCase());
        if (!fileLoaders.includes(loaderLower)) return false;
      }
    } else {
      // Library context - use user-selected filters
      // Filter by game version
      if (filterGameVersion.value !== "all") {
        const hasMatchingVersion = fileVersions.some(
          (gv: string) =>
            gv === filterGameVersion.value ||
            gv.startsWith(filterGameVersion.value + ".") ||
            filterGameVersion.value.startsWith(gv + ".")
        );
        if (!hasMatchingVersion) return false;
      }

      // Filter by loader (only for mods)
      if (isModContext.value && filterLoader.value !== "all") {
        const loaderLower = filterLoader.value.toLowerCase();
        const fileLoaders = fileVersions.map((gv: string) => gv.toLowerCase());
        if (!fileLoaders.includes(loaderLower)) return false;
      }
    }

    return true;
  });
});

const selectedScreenshot = computed(() => {
  if (screenshots.value.length === 0) return null;
  return screenshots.value[selectedScreenshotIndex.value];
});

// Content type config
const contentTypeConfig = computed(() => {
  const contentType = props.mod?.content_type || "mod";
  const configs = {
    mod: { label: "Mod", icon: Layers, class: "bg-primary/15 text-primary ring-primary/30" },
    resourcepack: { label: "Resource Pack", icon: ImageIcon, class: "bg-blue-500/15 text-blue-400 ring-blue-500/30" },
    shader: { label: "Shader", icon: Sparkles, class: "bg-pink-500/15 text-pink-400 ring-pink-500/30" },
  };
  return configs[contentType] || configs.mod;
});

// Methods
async function loadModData() {
  if (!props.mod?.cf_project_id) return;

  try {
    // Load full mod data from CurseForge
    cfModData.value = await window.api.curseforge.getMod(props.mod.cf_project_id);

    // Extract screenshots
    if (cfModData.value?.screenshots) {
      screenshots.value = cfModData.value.screenshots;
    }
  } catch (err) {
    console.error("Failed to load mod data:", err);
  }
}

async function loadDescription() {
  if (!props.mod?.cf_project_id || description.value) return;

  isLoadingDescription.value = true;
  try {
    description.value = await window.api.curseforge.getModDescription(props.mod.cf_project_id);
  } catch (err) {
    console.error("Failed to load description:", err);
    description.value = "<p class='text-muted-foreground'>Failed to load description</p>";
  } finally {
    isLoadingDescription.value = false;
  }
}

async function loadFiles() {
  if (!props.mod?.cf_project_id || files.value.length > 0) return;

  isLoadingFiles.value = true;
  try {
    // If in modpack context, filter by game version only - let UI filter handle loader
    // This matches CurseForgeSearch behavior where loader is filtered in the UI
    const options: any = {};
    if (props.context?.type === "modpack") {
      if (props.context.gameVersion) {
        options.gameVersion = props.context.gameVersion;
      }
      // Also pass loader to API for mods to get relevant files
      if (isModContext.value && props.context.loader) {
        options.modLoader = props.context.loader;
      }
    }

    const result = await window.api.curseforge.getModFiles(props.mod.cf_project_id, options);

    // Sort by date desc
    files.value = result.sort(
      (a: any, b: any) => new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
    );

    // Pre-select current file if provided
    if (props.currentFileId) {
      selectedFileId.value = props.currentFileId;
    } else if (filteredFiles.value.length > 0) {
      selectedFileId.value = filteredFiles.value[0].id;
    }
  } catch (err) {
    console.error("Failed to load files:", err);
  } finally {
    isLoadingFiles.value = false;
  }
}

async function handleVersionChange() {
  if (!selectedFileId.value || selectedFileId.value === props.currentFileId) return;

  isChangingVersion.value = true;
  try {
    emit("version-changed", selectedFileId.value);
  } finally {
    isChangingVersion.value = false;
  }
}

function openCurseForge() {
  if (!props.mod?.slug) return;
  const baseUrl = "https://www.curseforge.com/minecraft";
  let path = "mc-mods";
  if (props.mod.content_type === "resourcepack") path = "texture-packs";
  if (props.mod.content_type === "shader") path = "customization";

  window.open(`${baseUrl}/${path}/${props.mod.slug}`, "_blank");
}

function nextScreenshot() {
  if (selectedScreenshotIndex.value < screenshots.value.length - 1) {
    selectedScreenshotIndex.value++;
  } else {
    selectedScreenshotIndex.value = 0;
  }
}

function prevScreenshot() {
  if (selectedScreenshotIndex.value > 0) {
    selectedScreenshotIndex.value--;
  } else {
    selectedScreenshotIndex.value = screenshots.value.length - 1;
  }
}

function getReleaseTypeClass(type: number) {
  switch (type) {
    case 1: return "bg-primary/15 text-primary ring-1 ring-primary/30";
    case 2: return "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30";
    case 3: return "bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

function getReleaseTypeName(type: number) {
  switch (type) {
    case 1: return "Release";
    case 2: return "Beta";
    case 3: return "Alpha";
    default: return "Unknown";
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDownloads(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

function getGameVersionsDisplay(gameVersions: string[] | undefined): string {
  if (!gameVersions) return "";
  return gameVersions
    .filter((v) => /^1\.\d+/.test(v) || ["Forge", "Fabric", "NeoForge", "Quilt"].includes(v))
    .slice(0, 4)
    .join(", ");
}

// Watch for tab changes
watch(activeTab, (tab) => {
  if (tab === "description") {
    loadDescription();
  } else if (tab === "files") {
    loadFiles();
  }
});

// Watch for modal open
watch(() => props.open, (isOpen) => {
  if (isOpen && props.mod) {
    // Reset state
    activeTab.value = "description";
    description.value = "";
    screenshots.value = [];
    files.value = [];
    selectedScreenshotIndex.value = 0;
    selectedFileId.value = null;
    showLightbox.value = false;

    // Load data immediately when modal opens
    loadModData();
    // Force load description immediately (not waiting for tab change)
    setTimeout(() => {
      loadDescription();
    }, 0);
    // Also load files in background to populate available versions/loaders in header
    if (!props.hideFilesTab) {
      loadFiles();
    }
  }
}, { immediate: true });

// Handle keyboard navigation for gallery
function handleKeydown(e: KeyboardEvent) {
  if (!showLightbox.value) return;

  if (e.key === "ArrowLeft") {
    prevScreenshot();
  } else if (e.key === "ArrowRight") {
    nextScreenshot();
  } else if (e.key === "Escape") {
    showLightbox.value = false;
  }
}

// Handle scroll for header collapse/expand
function handleScroll(e: Event) {
  const target = e.target as HTMLElement;
  const currentScrollTop = target.scrollTop;
  const scrollDiff = currentScrollTop - lastScrollTop.value;

  // Only change state if scrolled past threshold for tolerance
  if (scrollDiff > scrollThreshold && currentScrollTop > 100) {
    // Scrolling down - collapse header
    isHeaderCollapsed.value = true;
  } else if (scrollDiff < -scrollThreshold || currentScrollTop <= 50) {
    // Scrolling up or near top - expand header
    isHeaderCollapsed.value = false;
  }

  lastScrollTop.value = currentScrollTop;
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});

// Reset header state when modal opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    isHeaderCollapsed.value = false;
    lastScrollTop.value = 0;
  }
}, { immediate: true });
</script>

<template>
  <!-- Fullscreen mode - positioned within main content area, not covering sidebar -->
  <Transition enter-active-class="transition-all duration-200 ease-out"
    leave-active-class="transition-all duration-150 ease-in" enter-from-class="opacity-0" leave-to-class="opacity-0">
    <div v-if="fullScreen && open" class="absolute inset-0 z-50 flex flex-col bg-background overflow-hidden">
      <!-- CurseForge-style Hero Header -->
      <div class="relative shrink-0 border-b border-border overflow-hidden transition-all duration-300 ease-out"
        :class="isHeaderCollapsed ? 'max-h-[60px]' : 'max-h-[300px]'">
        <!-- Background gradient with mod accent color -->
        <div class="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-background" />
        <div
          class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

        <!-- Back button floating -->
        <Button variant="ghost" size="sm" @click="emit('close')"
          class="absolute top-4 left-4 z-10 gap-2 bg-background/80 backdrop-blur-sm hover:bg-background/90 shadow-lg border border-border/50">
          <ArrowLeft class="w-4 h-4" />
          Back
        </Button>

        <!-- External link button floating -->
        <Button variant="ghost" size="sm" @click="openCurseForge" title="Open on CurseForge"
          class="absolute top-4 right-4 z-10 gap-2 bg-background/80 backdrop-blur-sm hover:bg-background/90 shadow-lg border border-border/50">
          <ExternalLink class="w-4 h-4" />
          <span class="hidden sm:inline">CurseForge</span>
        </Button>

        <!-- Collapsed Header (shown when scrolling) -->
        <div v-if="isHeaderCollapsed" class="relative px-6 py-3 flex items-center gap-4">
          <!-- Logo small -->
          <div
            class="w-10 h-10 rounded-lg overflow-hidden bg-background/80 border border-border/50 shadow shrink-0 ml-12">
            <img v-if="mod?.logo_url || mod?.thumbnail_url" :src="mod.logo_url || mod.thumbnail_url" :alt="mod?.name"
              class="w-full h-full object-cover" />
            <div v-else class="w-full h-full flex items-center justify-center bg-muted">
              <component :is="contentTypeConfig.icon" class="w-5 h-5 text-muted-foreground/40" />
            </div>
          </div>

          <!-- Title -->
          <h1 class="text-lg font-bold text-foreground truncate">{{ mod?.name }}</h1>

          <!-- Quick stats -->
          <div class="flex items-center gap-2 ml-auto mr-16">
            <span class="px-2 py-0.5 rounded text-xs font-medium" :class="contentTypeConfig.class">
              {{ contentTypeConfig.label }}
            </span>
            <span v-if="mod?.game_version" class="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
              {{ mod.game_version }}
            </span>
            <span v-if="mod?.loader && isModContext" class="px-2 py-0.5 rounded text-xs"
              :class="mod.loader?.toLowerCase().includes('forge') ? 'bg-orange-500/15 text-orange-400' : 'bg-blue-500/15 text-blue-400'">
              {{ mod.loader }}
            </span>
          </div>
        </div>

        <!-- Main header content (full, hidden when collapsed) -->
        <div v-else class="relative px-6 pt-16 pb-6">
          <div class="flex items-start gap-6">
            <!-- Mod Logo - Large with glow effect -->
            <div class="relative group shrink-0">
              <div
                class="absolute -inset-2 bg-gradient-to-br from-primary/40 to-primary/10 rounded-3xl blur-xl opacity-50 group-hover:opacity-70 transition-opacity duration-500" />
              <div
                class="relative w-28 h-28 rounded-2xl overflow-hidden bg-background/80 backdrop-blur-sm border-2 border-border/50 shadow-2xl ring-1 ring-white/10">
                <img v-if="mod?.logo_url || mod?.thumbnail_url" :src="mod.logo_url || mod.thumbnail_url"
                  :alt="mod?.name"
                  class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500" />
                <div v-else
                  class="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                  <component :is="contentTypeConfig.icon" class="w-14 h-14 text-muted-foreground/40" />
                </div>
              </div>
            </div>

            <!-- Mod Info -->
            <div class="flex-1 min-w-0 py-2">
              <!-- Type badge & Name -->
              <div class="flex items-center gap-3 flex-wrap mb-2">
                <span class="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ring-1 shrink-0"
                  :class="contentTypeConfig.class">
                  <component :is="contentTypeConfig.icon" class="w-3.5 h-3.5" />
                  {{ contentTypeConfig.label }}
                </span>
                <h1 class="text-2xl sm:text-3xl font-bold text-foreground tracking-tight truncate">{{ mod?.name }}</h1>
              </div>

              <!-- Author -->
              <div class="flex items-center gap-2 text-muted-foreground mb-4">
                <User class="w-4 h-4 text-primary/70" />
                <span class="font-medium">by {{ mod?.author || "Unknown" }}</span>
              </div>

              <!-- Stats Row -->
              <div class="flex items-center gap-3 flex-wrap">
                <div v-if="mod?.download_count"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/60 backdrop-blur-sm border border-border/40 shadow-sm">
                  <Download class="w-4 h-4 text-green-400" />
                  <span class="text-sm font-semibold text-foreground">{{ formatDownloads(mod.download_count) }}</span>
                  <span class="text-xs text-muted-foreground">downloads</span>
                </div>

                <div v-if="mod?.game_version"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/60 backdrop-blur-sm border border-border/40 shadow-sm">
                  <Tag class="w-4 h-4 text-blue-400" />
                  <span class="text-sm font-semibold text-foreground">{{ mod.game_version }}</span>
                </div>

                <div v-if="mod?.loader && isModContext"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm" :class="mod.loader?.toLowerCase().includes('forge')
                    ? 'bg-orange-500/10 border-orange-500/30'
                    : 'bg-blue-500/10 border-blue-500/30'">
                  <span class="text-sm font-semibold"
                    :class="mod.loader?.toLowerCase().includes('forge') ? 'text-orange-400' : 'text-blue-400'">
                    {{ mod.loader }}
                  </span>
                </div>

                <div v-if="mod?.date_released"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/60 backdrop-blur-sm border border-border/40 shadow-sm">
                  <Calendar class="w-4 h-4 text-muted-foreground" />
                  <span class="text-sm text-muted-foreground">{{ formatDate(mod.date_released) }}</span>
                </div>
              </div>

              <!-- Available Versions & Loaders (shown for mods/resourcepacks/shaders) -->
              <div v-if="availableGameVersions.length > 0 || availableLoaders.length > 0"
                class="mt-4 flex flex-wrap items-center gap-2">
                <!-- Available Game Versions -->
                <div v-if="availableGameVersions.length > 0" class="flex items-center gap-1.5">
                  <span class="text-xs text-muted-foreground">Versions:</span>
                  <div class="flex flex-wrap gap-1">
                    <span v-for="v in availableGameVersions.slice(0, 6)" :key="v"
                      class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      {{ v }}
                    </span>
                    <span v-if="availableGameVersions.length > 6"
                      class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/40 text-muted-foreground">
                      +{{ availableGameVersions.length - 6 }} more
                    </span>
                  </div>
                </div>

                <!-- Separator -->
                <div v-if="availableGameVersions.length > 0 && availableLoaders.length > 0"
                  class="w-px h-4 bg-border/50" />

                <!-- Available Loaders (only for mods) -->
                <div v-if="isModContext && availableLoaders.length > 0" class="flex items-center gap-1.5">
                  <span class="text-xs text-muted-foreground">Loaders:</span>
                  <div class="flex flex-wrap gap-1">
                    <span v-for="l in availableLoaders.slice(0, 4)" :key="l"
                      class="px-1.5 py-0.5 rounded text-[10px] font-medium" :class="l === 'Forge' ? 'bg-orange-500/15 text-orange-400' :
                        l === 'NeoForge' ? 'bg-orange-500/15 text-orange-400' :
                          'bg-blue-500/15 text-blue-400'">
                      {{ l }}
                    </span>
                    <span v-if="availableLoaders.length > 4"
                      class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/40 text-muted-foreground">
                      +{{ availableLoaders.length - 4 }} more
                    </span>
                  </div>
                </div>
              </div>

              <!-- Description preview -->
              <p v-if="mod?.description"
                class="text-sm text-muted-foreground/80 mt-4 line-clamp-2 leading-relaxed max-w-3xl">
                {{ mod.description }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div ref="scrollContainerRef" class="flex-1 overflow-auto" @scroll="handleScroll">
        <!-- Tabs navigation bar -->
        <div class="sticky top-0 z-20 px-6 pt-4 pb-2 bg-background">
          <div class="flex p-1 bg-muted/50 rounded-xl border border-border/40 shadow-sm">
            <button v-for="tab in availableTabs" :key="tab"
              class="flex-1 px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg flex items-center justify-center gap-2"
              :class="activeTab === tab
                ? 'bg-background text-foreground shadow-md border border-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'" @click="activeTab = tab">
              <FileText v-if="tab === 'description'" class="w-4 h-4" />
              <ImageIcon v-else-if="tab === 'gallery'" class="w-4 h-4" />
              <Package v-else class="w-4 h-4" />
              <span class="capitalize">{{ tab }}</span>
              <span v-if="tab === 'gallery' && screenshots.length > 0" class="text-xs px-1.5 py-0.5 rounded-full"
                :class="activeTab === tab ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'">
                {{ screenshots.length }}
              </span>
              <span v-if="tab === 'files' && files.length > 0" class="text-xs px-1.5 py-0.5 rounded-full"
                :class="activeTab === tab ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'">
                {{ filteredFiles.length }}
              </span>
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <!-- Description Tab -->
          <div v-if="activeTab === 'description'" class="min-h-[300px]">
            <div v-if="isLoadingDescription" class="flex flex-col items-center justify-center py-16">
              <Loader2 class="w-8 h-8 animate-spin text-primary/60" />
              <span class="text-sm text-muted-foreground mt-3">Loading description...</span>
            </div>
            <div v-else
              class="prose prose-sm prose-invert max-w-none mod-description bg-muted/20 rounded-xl p-6 border border-border/30"
              v-html="description" />
          </div>

          <!-- Gallery Tab -->
          <div v-else-if="activeTab === 'gallery'" class="min-h-[300px]">
            <div v-if="screenshots.length === 0"
              class="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div class="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <ImageIcon class="w-10 h-10 opacity-40" />
              </div>
              <p class="font-medium">No screenshots available</p>
              <p class="text-sm mt-1 opacity-70">This mod hasn't uploaded any images yet</p>
            </div>

            <div v-else class="space-y-5">
              <!-- Main Image with enhanced styling -->
              <div
                class="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-muted/40 to-muted/20 cursor-pointer group shadow-xl ring-1 ring-border/30"
                @click="showLightbox = true">
                <img v-if="selectedScreenshot" :src="selectedScreenshot.url"
                  :alt="selectedScreenshot.title || 'Screenshot'"
                  class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]" />
                <div
                  class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <div class="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                    <span v-if="selectedScreenshot?.title" class="text-white font-medium text-sm drop-shadow-lg">
                      {{ selectedScreenshot.title }}
                    </span>
                    <span class="text-white/90 text-sm bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full">
                      Click to enlarge
                    </span>
                  </div>
                </div>

                <!-- Navigation Arrows with improved design -->
                <button v-if="screenshots.length > 1"
                  class="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 hover:scale-110 transition-all duration-200 shadow-lg"
                  @click.stop="prevScreenshot">
                  <ChevronLeft class="w-5 h-5" />
                </button>
                <button v-if="screenshots.length > 1"
                  class="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 hover:scale-110 transition-all duration-200 shadow-lg"
                  @click.stop="nextScreenshot">
                  <ChevronRight class="w-5 h-5" />
                </button>

                <!-- Image counter badge -->
                <div
                  class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs font-medium">
                  {{ selectedScreenshotIndex + 1 }} / {{ screenshots.length }}
                </div>
              </div>

              <!-- Thumbnails with enhanced styling -->
              <div v-if="screenshots.length > 1" class="flex gap-2.5 overflow-x-auto pb-2 px-0.5">
                <button v-for="(screenshot, index) in screenshots" :key="screenshot.id"
                  class="shrink-0 w-28 h-20 rounded-xl overflow-hidden transition-all duration-200 ring-2 ring-offset-2 ring-offset-background"
                  :class="index === selectedScreenshotIndex
                    ? 'ring-primary shadow-lg shadow-primary/20 scale-105'
                    : 'ring-transparent hover:ring-border hover:scale-102'" @click="selectedScreenshotIndex = index">
                  <img :src="screenshot.thumbnailUrl" :alt="screenshot.title || `Screenshot ${index + 1}`"
                    class="w-full h-full object-cover" />
                </button>
              </div>

              <!-- Screenshot Info with better styling -->
              <div v-if="selectedScreenshot?.title || selectedScreenshot?.description"
                class="p-4 rounded-xl bg-muted/30 border border-border/30">
                <p v-if="selectedScreenshot.title" class="font-semibold text-foreground">{{ selectedScreenshot.title }}
                </p>
                <p v-if="selectedScreenshot.description" class="text-sm text-muted-foreground mt-1">{{
                  selectedScreenshot.description }}</p>
              </div>
            </div>
          </div>

          <!-- Files Tab -->
          <div v-else-if="activeTab === 'files'" class="min-h-[300px]">
            <div v-if="isLoadingFiles" class="flex flex-col items-center justify-center py-16">
              <Loader2 class="w-8 h-8 animate-spin text-primary/60" />
              <span class="text-sm text-muted-foreground mt-3">Loading versions...</span>
            </div>

            <div v-else>
              <!-- Context Info Banner with enhanced design -->
              <div v-if="context?.type === 'modpack'"
                class="mb-5 p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 shadow-sm">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Info class="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <span class="text-sm font-semibold text-primary">Modpack Compatibility Filter</span>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      Showing versions for
                      <span class="font-semibold text-foreground">{{ context.gameVersion }}</span>
                      <span v-if="context.loader && isModContext"> + {{ context.loader }}</span>
                    </p>
                  </div>
                </div>
              </div>

              <!-- Release Type Filters with modern toggle buttons -->
              <div class="flex flex-wrap items-center gap-3 mb-5 p-3 rounded-xl bg-muted/30 border border-border/30">
                <span class="text-sm text-muted-foreground font-medium">Filter:</span>
                <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                  :class="filterRelease ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/50'">
                  <input type="checkbox" v-model="filterRelease" class="sr-only" />
                  <div class="w-3.5 h-3.5 rounded-full bg-primary ring-2 ring-primary/30" />
                  <span class="text-sm font-medium"
                    :class="filterRelease ? 'text-primary' : 'text-muted-foreground'">Release</span>
                </label>
                <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                  :class="filterBeta ? 'bg-blue-500/15 ring-1 ring-blue-500/30' : 'hover:bg-muted/50'">
                  <input type="checkbox" v-model="filterBeta" class="sr-only" />
                  <div class="w-3.5 h-3.5 rounded-full bg-blue-500 ring-2 ring-blue-500/30" />
                  <span class="text-sm font-medium"
                    :class="filterBeta ? 'text-blue-400' : 'text-muted-foreground'">Beta</span>
                </label>
                <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                  :class="filterAlpha ? 'bg-orange-500/15 ring-1 ring-orange-500/30' : 'hover:bg-muted/50'">
                  <input type="checkbox" v-model="filterAlpha" class="sr-only" />
                  <div class="w-3.5 h-3.5 rounded-full bg-orange-500 ring-2 ring-orange-500/30" />
                  <span class="text-sm font-medium"
                    :class="filterAlpha ? 'text-orange-400' : 'text-muted-foreground'">Alpha</span>
                </label>

                <!-- Game Version & Loader Filters (only in library context) -->
                <template v-if="!canChangeVersion">
                  <div class="h-5 w-px bg-border/50 mx-1" />

                  <!-- Game Version Filter -->
                  <div class="relative" v-if="availableGameVersions.length > 0">
                    <select v-model="filterGameVersion"
                      class="h-8 pl-3 pr-7 rounded-lg bg-muted/50 border-none text-sm font-medium appearance-none cursor-pointer focus:ring-1 focus:ring-primary transition-all"
                      :class="filterGameVersion !== 'all' ? 'text-primary bg-primary/10 ring-1 ring-primary/30' : 'text-muted-foreground'">
                      <option value="all">All Versions</option>
                      <option v-for="v in availableGameVersions" :key="v" :value="v">{{ v }}</option>
                    </select>
                    <ChevronDown
                      class="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none opacity-50" />
                  </div>

                  <!-- Loader Filter (only for mods) -->
                  <div class="relative" v-if="isModContext && availableLoaders.length > 0">
                    <select v-model="filterLoader"
                      class="h-8 pl-3 pr-7 rounded-lg bg-muted/50 border-none text-sm font-medium appearance-none cursor-pointer focus:ring-1 focus:ring-primary transition-all"
                      :class="filterLoader !== 'all'
                        ? (filterLoader === 'Forge' ? 'text-orange-400 bg-orange-500/10 ring-1 ring-orange-500/30' : 'text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/30')
                        : 'text-muted-foreground'">
                      <option value="all">All Loaders</option>
                      <option v-for="l in availableLoaders" :key="l" :value="l">{{ l }}</option>
                    </select>
                    <ChevronDown
                      class="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none opacity-50" />
                  </div>
                </template>

                <!-- File count -->
                <span class="ml-auto text-xs text-muted-foreground">{{ filteredFiles.length }} files</span>
              </div>

              <!-- Info banner for readonly/linked modpack -->
              <div v-if="context?.type === 'modpack' && isReadonly"
                class="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                <Lock class="w-5 h-5 text-amber-400 shrink-0" />
                <p class="text-sm text-amber-300">
                  This modpack is in read-only mode. Version changes are disabled to maintain sync with the source.
                </p>
              </div>

              <!-- Info banner for library context -->
              <div v-else-if="!canChangeVersion"
                class="mb-4 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
                <Info class="w-5 h-5 text-blue-400 shrink-0" />
                <p class="text-sm text-blue-300">
                  Version changes are only available when editing a modpack. Here you can browse available versions.
                </p>
              </div>

              <!-- Files List - Empty State -->
              <div v-if="filteredFiles.length === 0" class="text-center py-12">
                <div class="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Package class="w-10 h-10 text-muted-foreground/40" />
                </div>
                <p class="font-medium text-foreground">No compatible files found</p>
                <p class="text-sm text-muted-foreground mt-1.5">Try enabling more release types or check CurseForge
                  directly</p>
              </div>

              <!-- Files List with enhanced cards -->
              <div v-else class="space-y-2.5 max-h-[400px] overflow-y-auto pr-2">
                <div v-for="file in filteredFiles" :key="file.id"
                  class="p-4 rounded-xl border-2 transition-all duration-200 group" :class="[
                    canChangeVersion ? 'cursor-pointer' : 'cursor-default',
                    canChangeVersion && selectedFileId === file.id
                      ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                      : 'border-border/40 bg-muted/20',
                    canChangeVersion && selectedFileId !== file.id ? 'hover:border-primary/40 hover:bg-muted/40' : '',
                    file.id === currentFileId ? 'ring-2 ring-primary/20 ring-offset-2 ring-offset-background' : ''
                  ]" @click="canChangeVersion && (selectedFileId = file.id)">
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2.5 flex-wrap">
                        <span
                          class="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                          {{ file.displayName }}
                        </span>
                        <span class="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide shrink-0"
                          :class="getReleaseTypeClass(file.releaseType)">
                          {{ getReleaseTypeName(file.releaseType) }}
                        </span>
                        <span v-if="file.id === currentFileId"
                          class="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide bg-primary/20 text-primary shrink-0 flex items-center gap-1">
                          <Check class="w-3 h-3" />
                          Installed
                        </span>
                      </div>

                      <div class="flex items-center gap-4 mt-2.5 text-xs text-muted-foreground">
                        <span class="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                          <Calendar class="w-3.5 h-3.5 text-primary/60" />
                          {{ formatDate(file.fileDate) }}
                        </span>
                        <span class="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                          <HardDrive class="w-3.5 h-3.5 text-blue-400/60" />
                          {{ formatSize(file.fileLength) }}
                        </span>
                        <span class="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                          <Download class="w-3.5 h-3.5 text-green-400/60" />
                          {{ formatDownloads(file.downloadCount) }}
                        </span>
                      </div>

                      <div class="flex items-center gap-1.5 mt-2.5 flex-wrap">
                        <span v-for="gv in getFileVersionTags(file.gameVersions)" :key="gv"
                          class="px-2 py-0.5 rounded-md text-[10px] font-medium" :class="['Forge', 'Fabric', 'NeoForge', 'Quilt'].includes(gv)
                            ? (gv === 'Forge' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400')
                            : 'bg-muted text-muted-foreground'">
                          {{ gv }}
                        </span>
                      </div>
                    </div>

                    <!-- Selection Indicator with animation (only in modpack context) -->
                    <div v-if="canChangeVersion"
                      class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200"
                      :class="selectedFileId === file.id
                        ? 'border-primary bg-primary scale-110'
                        : 'border-muted-foreground/30 group-hover:border-primary/50'">
                      <Check v-if="selectedFileId === file.id" class="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Fullscreen footer -->
      <div class="flex items-center justify-between w-full px-6 py-4 border-t border-border bg-muted/30 shrink-0">
        <div class="text-xs text-muted-foreground flex items-center gap-2">
          <Clock class="w-3.5 h-3.5" />
          <span v-if="mod?.date_released">
            Released {{ formatDate(mod.date_released) }}
          </span>
          <span v-else>—</span>
        </div>

        <div class="flex gap-3">
          <Button variant="outline" @click="emit('close')" class="px-5">
            Close
          </Button>

          <!-- Change Version Button with enhanced design -->
          <Button
            v-if="context?.type === 'modpack' && activeTab === 'files' && selectedFileId && selectedFileId !== currentFileId"
            @click="handleVersionChange" :disabled="isChangingVersion"
            class="px-5 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/20">
            <Loader2 v-if="isChangingVersion" class="w-4 h-4 mr-2 animate-spin" />
            <RefreshCw v-else class="w-4 h-4 mr-2" />
            Change to Selected Version
          </Button>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Dialog mode -->
  <Dialog v-if="!fullScreen" :open="open" @close="emit('close')" size="6xl"
    contentClass="flex flex-col max-h-[90vh] !p-0 overflow-hidden">
    <template #header>
      <div
        class="relative -m-6 mb-0 p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-b border-border/30">
        <!-- Background decoration -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
          <div class="absolute -top-12 -right-12 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
          <div class="absolute top-0 left-1/2 w-32 h-32 bg-primary/3 rounded-full blur-2xl" />
        </div>

        <div class="relative flex items-start gap-5 pr-8">
          <!-- Mod Logo with glow effect -->
          <div class="relative group">
            <div
              class="absolute -inset-1 bg-gradient-to-br from-primary/30 to-primary/10 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div
              class="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-background/80 backdrop-blur-sm border border-border/50 shadow-lg ring-1 ring-white/5">
              <img v-if="mod?.logo_url || mod?.thumbnail_url" :src="mod.logo_url || mod.thumbnail_url" :alt="mod?.name"
                class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-300" />
              <div v-else
                class="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                <component :is="contentTypeConfig.icon" class="w-10 h-10 text-muted-foreground/50" />
              </div>
            </div>
          </div>

          <!-- Mod Info -->
          <div class="flex-1 min-w-0 py-0.5">
            <div class="flex items-center gap-3 flex-wrap">
              <h2 class="text-2xl font-bold text-foreground tracking-tight">{{ mod?.name }}</h2>
              <span class="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ring-1"
                :class="contentTypeConfig.class">
                <component :is="contentTypeConfig.icon" class="w-3.5 h-3.5" />
                {{ contentTypeConfig.label }}
              </span>
            </div>

            <div class="flex items-center gap-2 mt-3 flex-wrap">
              <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <User class="w-3.5 h-3.5 text-primary/70" />
                <span class="font-medium">{{ mod?.author || "Unknown" }}</span>
              </div>
              <div v-if="mod?.download_count"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <Download class="w-3.5 h-3.5 text-green-500/70" />
                <span class="font-medium">{{ formatDownloads(mod.download_count) }}</span>
              </div>
              <div v-if="mod?.game_version"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <Tag class="w-3.5 h-3.5 text-blue-500/70" />
                <span class="font-medium">{{ mod.game_version }}</span>
              </div>
              <span v-if="mod?.loader && isModContext" class="px-2.5 py-1 rounded-lg text-xs font-semibold"
                :class="mod.loader?.toLowerCase().includes('forge') ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30' : 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30'">
                {{ mod.loader }}
              </span>
            </div>

            <p v-if="mod?.description" class="text-sm text-muted-foreground/90 mt-3 line-clamp-2 leading-relaxed">
              {{ mod.description }}
            </p>
          </div>

          <!-- External Link Button -->
          <Button variant="ghost" size="icon" @click="openCurseForge" title="Open on CurseForge"
            class="shrink-0 hover:bg-primary/10 hover:text-primary transition-colors">
            <ExternalLink class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </template>

    <!-- Tabs with modern styling -->
    <div class="flex gap-1 bg-muted/30 p-1.5 mx-6 mt-4 rounded-xl">
      <button v-for="tab in availableTabs" :key="tab"
        class="flex-1 px-4 py-2.5 text-sm font-medium transition-all duration-200 rounded-lg" :class="activeTab === tab
          ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'" @click="activeTab = tab">
        <span class="flex items-center justify-center gap-2">
          <FileText v-if="tab === 'description'" class="w-4 h-4" />
          <ImageIcon v-else-if="tab === 'gallery'" class="w-4 h-4" />
          <Package v-else class="w-4 h-4" />
          <span class="capitalize">{{ tab }}</span>
          <span v-if="tab === 'gallery' && screenshots.length > 0" class="text-xs px-1.5 py-0.5 rounded-full"
            :class="activeTab === tab ? 'bg-primary/15 text-primary' : 'bg-muted-foreground/20 text-muted-foreground'">
            {{ screenshots.length }}
          </span>
          <span v-if="tab === 'files' && context?.type === 'modpack'"
            class="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-medium">
            Filtered
          </span>
        </span>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto px-6 py-5">
      <!-- Description Tab -->
      <div v-if="activeTab === 'description'" class="min-h-[300px]">
        <div v-if="isLoadingDescription" class="flex flex-col items-center justify-center py-16">
          <Loader2 class="w-8 h-8 animate-spin text-primary/60" />
          <span class="text-sm text-muted-foreground mt-3">Loading description...</span>
        </div>
        <div v-else
          class="prose prose-sm prose-invert max-w-none mod-description bg-muted/20 rounded-xl p-6 border border-border/30"
          v-html="description" />
      </div>

      <!-- Gallery Tab -->
      <div v-else-if="activeTab === 'gallery'" class="min-h-[300px]">
        <div v-if="screenshots.length === 0"
          class="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div class="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <ImageIcon class="w-10 h-10 opacity-40" />
          </div>
          <p class="font-medium">No screenshots available</p>
          <p class="text-sm mt-1 opacity-70">This mod hasn't uploaded any images yet</p>
        </div>

        <div v-else class="space-y-5">
          <!-- Main Image with enhanced styling -->
          <div
            class="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-muted/40 to-muted/20 cursor-pointer group shadow-xl ring-1 ring-border/30"
            @click="showLightbox = true">
            <img v-if="selectedScreenshot" :src="selectedScreenshot.url" :alt="selectedScreenshot.title || 'Screenshot'"
              class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]" />
            <div
              class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300">
              <div class="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <span v-if="selectedScreenshot?.title" class="text-white font-medium text-sm drop-shadow-lg">
                  {{ selectedScreenshot.title }}
                </span>
                <span class="text-white/90 text-sm bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full">
                  Click to enlarge
                </span>
              </div>
            </div>

            <!-- Navigation Arrows with improved design -->
            <button v-if="screenshots.length > 1"
              class="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 hover:scale-110 transition-all duration-200 shadow-lg"
              @click.stop="prevScreenshot">
              <ChevronLeft class="w-5 h-5" />
            </button>
            <button v-if="screenshots.length > 1"
              class="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 hover:scale-110 transition-all duration-200 shadow-lg"
              @click.stop="nextScreenshot">
              <ChevronRight class="w-5 h-5" />
            </button>

            <!-- Image counter badge -->
            <div
              class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs font-medium">
              {{ selectedScreenshotIndex + 1 }} / {{ screenshots.length }}
            </div>
          </div>

          <!-- Thumbnails with enhanced styling -->
          <div v-if="screenshots.length > 1" class="flex gap-2.5 overflow-x-auto pb-2 px-0.5">
            <button v-for="(screenshot, index) in screenshots" :key="screenshot.id"
              class="shrink-0 w-28 h-20 rounded-xl overflow-hidden transition-all duration-200 ring-2 ring-offset-2 ring-offset-background"
              :class="index === selectedScreenshotIndex
                ? 'ring-primary shadow-lg shadow-primary/20 scale-105'
                : 'ring-transparent hover:ring-border hover:scale-102'" @click="selectedScreenshotIndex = index">
              <img :src="screenshot.thumbnailUrl" :alt="screenshot.title || `Screenshot ${index + 1}`"
                class="w-full h-full object-cover" />
            </button>
          </div>

          <!-- Screenshot Info with better styling -->
          <div v-if="selectedScreenshot?.title || selectedScreenshot?.description"
            class="p-4 rounded-xl bg-muted/30 border border-border/30">
            <p v-if="selectedScreenshot.title" class="font-semibold text-foreground">{{ selectedScreenshot.title }}</p>
            <p v-if="selectedScreenshot.description" class="text-sm text-muted-foreground mt-1">{{
              selectedScreenshot.description }}</p>
          </div>
        </div>
      </div>

      <!-- Files Tab -->
      <div v-else-if="activeTab === 'files'" class="min-h-[300px]">
        <div v-if="isLoadingFiles" class="flex flex-col items-center justify-center py-16">
          <Loader2 class="w-8 h-8 animate-spin text-primary/60" />
          <span class="text-sm text-muted-foreground mt-3">Loading versions...</span>
        </div>

        <div v-else>
          <!-- Context Info Banner with enhanced design -->
          <div v-if="context?.type === 'modpack'"
            class="mb-5 p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 shadow-sm">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <Info class="w-4 h-4 text-primary" />
              </div>
              <div>
                <span class="text-sm font-semibold text-primary">Modpack Compatibility Filter</span>
                <p class="text-xs text-muted-foreground mt-0.5">
                  Showing versions for
                  <span class="font-semibold text-foreground">{{ context.gameVersion }}</span>
                  <span v-if="context.loader && isModContext"> + {{ context.loader }}</span>
                </p>
              </div>
            </div>
          </div>

          <!-- Release Type Filters with modern toggle buttons -->
          <div class="flex flex-wrap items-center gap-3 mb-5 p-3 rounded-xl bg-muted/30 border border-border/30">
            <span class="text-sm text-muted-foreground font-medium">Filter:</span>
            <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
              :class="filterRelease ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/50'">
              <input type="checkbox" v-model="filterRelease" class="sr-only" />
              <div class="w-3.5 h-3.5 rounded-full bg-primary ring-2 ring-primary/30" />
              <span class="text-sm font-medium"
                :class="filterRelease ? 'text-primary' : 'text-muted-foreground'">Release</span>
            </label>
            <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
              :class="filterBeta ? 'bg-blue-500/15 ring-1 ring-blue-500/30' : 'hover:bg-muted/50'">
              <input type="checkbox" v-model="filterBeta" class="sr-only" />
              <div class="w-3.5 h-3.5 rounded-full bg-blue-500 ring-2 ring-blue-500/30" />
              <span class="text-sm font-medium"
                :class="filterBeta ? 'text-blue-400' : 'text-muted-foreground'">Beta</span>
            </label>
            <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
              :class="filterAlpha ? 'bg-orange-500/15 ring-1 ring-orange-500/30' : 'hover:bg-muted/50'">
              <input type="checkbox" v-model="filterAlpha" class="sr-only" />
              <div class="w-3.5 h-3.5 rounded-full bg-orange-500 ring-2 ring-orange-500/30" />
              <span class="text-sm font-medium"
                :class="filterAlpha ? 'text-orange-400' : 'text-muted-foreground'">Alpha</span>
            </label>

            <!-- Game Version & Loader Filters (only in library context) -->
            <template v-if="!canChangeVersion">
              <div class="h-5 w-px bg-border/50 mx-1" />

              <!-- Game Version Filter -->
              <div class="relative" v-if="availableGameVersions.length > 0">
                <select v-model="filterGameVersion"
                  class="h-8 pl-3 pr-7 rounded-lg bg-muted/50 border-none text-sm font-medium appearance-none cursor-pointer focus:ring-1 focus:ring-primary transition-all"
                  :class="filterGameVersion !== 'all' ? 'text-primary bg-primary/10 ring-1 ring-primary/30' : 'text-muted-foreground'">
                  <option value="all">All Versions</option>
                  <option v-for="v in availableGameVersions" :key="v" :value="v">{{ v }}</option>
                </select>
                <ChevronDown
                  class="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none opacity-50" />
              </div>

              <!-- Loader Filter (only for mods) -->
              <div class="relative" v-if="isModContext && availableLoaders.length > 0">
                <select v-model="filterLoader"
                  class="h-8 pl-3 pr-7 rounded-lg bg-muted/50 border-none text-sm font-medium appearance-none cursor-pointer focus:ring-1 focus:ring-primary transition-all"
                  :class="filterLoader !== 'all'
                    ? (filterLoader === 'Forge' ? 'text-orange-400 bg-orange-500/10 ring-1 ring-orange-500/30' : 'text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/30')
                    : 'text-muted-foreground'">
                  <option value="all">All Loaders</option>
                  <option v-for="l in availableLoaders" :key="l" :value="l">{{ l }}</option>
                </select>
                <ChevronDown
                  class="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none opacity-50" />
              </div>
            </template>

            <!-- File count -->
            <span class="ml-auto text-xs text-muted-foreground">{{ filteredFiles.length }} files</span>
          </div>

          <!-- Info banner for readonly/linked modpack -->
          <div v-if="context?.type === 'modpack' && isReadonly"
            class="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
            <Lock class="w-5 h-5 text-amber-400 shrink-0" />
            <p class="text-sm text-amber-300">
              This modpack is in read-only mode. Version changes are disabled to maintain sync with the source.
            </p>
          </div>

          <!-- Info banner for library context -->
          <div v-else-if="!canChangeVersion"
            class="mb-4 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
            <Info class="w-5 h-5 text-blue-400 shrink-0" />
            <p class="text-sm text-blue-300">
              Version changes are only available when editing a modpack. Here you can browse available versions.
            </p>
          </div>

          <!-- Files List - Empty State -->
          <div v-if="filteredFiles.length === 0" class="text-center py-12">
            <div class="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Package class="w-10 h-10 text-muted-foreground/40" />
            </div>
            <p class="font-medium text-foreground">No compatible files found</p>
            <p class="text-sm text-muted-foreground mt-1.5">Try enabling more release types or check CurseForge directly
            </p>
          </div>

          <!-- Files List with enhanced cards -->
          <div v-else class="space-y-2.5 max-h-[400px] overflow-y-auto pr-2">
            <div v-for="file in filteredFiles" :key="file.id"
              class="p-4 rounded-xl border-2 transition-all duration-200 group" :class="[
                canChangeVersion ? 'cursor-pointer' : 'cursor-default',
                canChangeVersion && selectedFileId === file.id
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                  : 'border-border/40 bg-muted/20',
                canChangeVersion && selectedFileId !== file.id ? 'hover:border-primary/40 hover:bg-muted/40' : '',
                file.id === currentFileId ? 'ring-2 ring-primary/20 ring-offset-2 ring-offset-background' : ''
              ]" @click="canChangeVersion && (selectedFileId = file.id)">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2.5 flex-wrap">
                    <span
                      class="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                      {{ file.displayName }}
                    </span>
                    <span class="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide shrink-0"
                      :class="getReleaseTypeClass(file.releaseType)">
                      {{ getReleaseTypeName(file.releaseType) }}
                    </span>
                    <span v-if="file.id === currentFileId"
                      class="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide bg-primary/20 text-primary shrink-0 flex items-center gap-1">
                      <Check class="w-3 h-3" />
                      Installed
                    </span>
                  </div>

                  <div class="flex items-center gap-4 mt-2.5 text-xs text-muted-foreground">
                    <span class="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                      <Calendar class="w-3.5 h-3.5 text-primary/60" />
                      {{ formatDate(file.fileDate) }}
                    </span>
                    <span class="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                      <HardDrive class="w-3.5 h-3.5 text-blue-400/60" />
                      {{ formatSize(file.fileLength) }}
                    </span>
                    <span class="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                      <Download class="w-3.5 h-3.5 text-green-400/60" />
                      {{ formatDownloads(file.downloadCount) }}
                    </span>
                  </div>

                  <div class="flex items-center gap-1.5 mt-2.5 flex-wrap">
                    <span v-for="gv in getFileVersionTags(file.gameVersions)" :key="gv"
                      class="px-2 py-0.5 rounded-md text-[10px] font-medium" :class="['Forge', 'Fabric', 'NeoForge', 'Quilt'].includes(gv)
                        ? (gv === 'Forge' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400')
                        : 'bg-muted text-muted-foreground'">
                      {{ gv }}
                    </span>
                  </div>
                </div>

                <!-- Selection Indicator with animation (only in modpack context) -->
                <div v-if="canChangeVersion"
                  class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200"
                  :class="selectedFileId === file.id
                    ? 'border-primary bg-primary scale-110'
                    : 'border-muted-foreground/30 group-hover:border-primary/50'">
                  <Check v-if="selectedFileId === file.id" class="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer slot for Dialog -->
    <template #footer>
      <div class="flex items-center justify-between w-full px-6 py-4 border-t border-border/30 bg-muted/5">
        <div class="text-xs text-muted-foreground flex items-center gap-2">
          <Clock class="w-3.5 h-3.5" />
          <span v-if="mod?.date_released">
            Released {{ formatDate(mod.date_released) }}
          </span>
          <span v-else>—</span>
        </div>

        <div class="flex gap-3">
          <Button variant="outline" @click="emit('close')" class="px-5">
            Close
          </Button>

          <!-- Change Version Button with enhanced design -->
          <Button
            v-if="context?.type === 'modpack' && activeTab === 'files' && selectedFileId && selectedFileId !== currentFileId"
            @click="handleVersionChange" :disabled="isChangingVersion"
            class="px-5 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/20">
            <Loader2 v-if="isChangingVersion" class="w-4 h-4 mr-2 animate-spin" />
            <RefreshCw v-else class="w-4 h-4 mr-2" />
            Change to Selected Version
          </Button>
        </div>
      </div>
    </template>
  </Dialog>

  <!-- Lightbox with enhanced animations (shared between modes) -->
  <Teleport to="body">
    <Transition enter-active-class="transition-all duration-300 ease-out"
      leave-active-class="transition-all duration-200 ease-in" enter-from-class="opacity-0" leave-to-class="opacity-0">
      <div v-if="showLightbox && selectedScreenshot"
        class="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center"
        @click="showLightbox = false">
        <button
          class="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all hover:scale-110 hover:rotate-90"
          @click.stop="showLightbox = false">
          <X class="w-6 h-6" />
        </button>

        <button v-if="screenshots.length > 1"
          class="absolute left-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all hover:scale-110"
          @click.stop="prevScreenshot">
          <ChevronLeft class="w-8 h-8" />
        </button>

        <Transition enter-active-class="transition-all duration-300 ease-out"
          leave-active-class="transition-all duration-200 ease-in" enter-from-class="opacity-0 scale-95"
          leave-to-class="opacity-0 scale-95" mode="out-in">
          <img :key="selectedScreenshotIndex" :src="selectedScreenshot.url"
            :alt="selectedScreenshot.title || 'Screenshot'"
            class="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl" @click.stop />
        </Transition>

        <button v-if="screenshots.length > 1"
          class="absolute right-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all hover:scale-110"
          @click.stop="nextScreenshot">
          <ChevronRight class="w-8 h-8" />
        </button>

        <!-- Image Counter & Title -->
        <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <span v-if="selectedScreenshot.title" class="text-white font-medium text-lg drop-shadow-lg">
            {{ selectedScreenshot.title }}
          </span>
          <div class="px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-white text-sm font-medium">
            {{ selectedScreenshotIndex + 1 }} / {{ screenshots.length }}
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Description HTML styling */
:deep(.mod-description) {
  @apply text-foreground leading-relaxed;
}

:deep(.mod-description h1),
:deep(.mod-description h2),
:deep(.mod-description h3),
:deep(.mod-description h4) {
  @apply text-foreground font-bold mt-6 mb-3 first:mt-0;
}

:deep(.mod-description h1) {
  @apply text-2xl pb-2 border-b border-border/30;
}

:deep(.mod-description h2) {
  @apply text-xl pb-1.5 border-b border-border/20;
}

:deep(.mod-description h3) {
  @apply text-lg;
}

:deep(.mod-description p) {
  @apply my-3 text-foreground/90 leading-relaxed;
}

:deep(.mod-description a) {
  @apply text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors font-medium;
}

:deep(.mod-description img) {
  @apply rounded-xl max-w-full my-5 shadow-lg ring-1 ring-border/20;
}

:deep(.mod-description ul),
:deep(.mod-description ol) {
  @apply my-3 pl-6 space-y-1.5;
}

:deep(.mod-description li) {
  @apply my-1 text-foreground/90;
}

:deep(.mod-description li::marker) {
  @apply text-primary/70;
}

:deep(.mod-description code) {
  @apply bg-muted/80 px-2 py-0.5 rounded-md text-sm font-mono text-primary/90;
}

:deep(.mod-description pre) {
  @apply bg-muted/80 p-4 rounded-xl overflow-x-auto my-5 border border-border/30 shadow-inner;
}

:deep(.mod-description pre code) {
  @apply bg-transparent p-0 text-foreground/90;
}

:deep(.mod-description blockquote) {
  @apply border-l-4 border-primary/40 pl-4 my-5 italic text-muted-foreground bg-primary/5 py-3 pr-4 rounded-r-lg;
}

:deep(.mod-description table) {
  @apply w-full border-collapse my-5 text-sm;
}

:deep(.mod-description th),
:deep(.mod-description td) {
  @apply border border-border/50 p-3 text-left;
}

:deep(.mod-description th) {
  @apply bg-muted/60 font-semibold text-foreground;
}

:deep(.mod-description tr:hover td) {
  @apply bg-muted/20;
}

:deep(.mod-description hr) {
  @apply my-8 border-border/50;
}

:deep(.mod-description strong) {
  @apply font-semibold text-foreground;
}

:deep(.mod-description em) {
  @apply italic text-foreground/80;
}

/* Scrollbar styling */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  @apply bg-muted/20 rounded-full;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  @apply bg-border/60 rounded-full hover:bg-border transition-colors;
}

.overflow-x-auto::-webkit-scrollbar {
  height: 8px;
}

.overflow-x-auto::-webkit-scrollbar-track {
  @apply bg-muted/20 rounded-full;
}

.overflow-x-auto::-webkit-scrollbar-thumb {
  @apply bg-border/60 rounded-full hover:bg-border transition-colors;
}

/* Smooth transitions for interactive elements */
button,
a {
  @apply transition-all duration-200;
}

/* Custom scale utilities */
.hover\:scale-102:hover {
  transform: scale(1.02);
}
</style>
