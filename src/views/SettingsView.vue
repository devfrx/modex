<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useTheme, stylePresets } from "@/composables/useTheme";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { useSidebar } from "@/composables/useSidebar";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import MinecraftInstallations from "@/components/ui/MinecraftInstallations.vue";
import {
  Settings as SettingsIcon,
  Database,
  Palette,
  Info,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  Heart,
  Globe,
  Key,
  Check,
  Sliders,
  RotateCcw,
  Square,
  Circle,
  Sparkles,
  PanelLeft,
  PanelRight,
  Eye,
  EyeOff,
  GripVertical,
  Home,
  Library,
  Package,
  FolderTree,
  BarChart3,
  LayoutGrid,
  BookOpen,
} from "lucide-vue-next";

// Sidebar settings
const {
  settings: sidebarSettings,
  setPosition,
  setCollapsed,
  toggleItemEnabled,
  resetSettings: resetSidebarSettings,
  defaultItems,
} = useSidebar();

// Icon mapping for sidebar items
const sidebarIconMap: Record<string, any> = {
  Home,
  Library,
  Package,
  FolderTree,
  BarChart3,
  LayoutGrid,
  BookOpen,
};

// App version from package.json
const appVersion = __APP_VERSION__;
const toast = useToast();
const { confirm } = useDialog();

// Settings State
const {
  currentTheme,
  setTheme,
  themes,
  customization,
  updateCustomization,
  applyStylePreset,
  resetCustomization,
} = useTheme();
const accentColor = ref("purple");
const modCount = ref(0);
const modpackCount = ref(0);
const isClearingData = ref(false);
const apiAvailable = ref(true);
const cfApiKey = ref("");
const isCheckingUpdate = ref(false);
const currentTab = ref("general");

// Instance Sync Settings
const syncSettings = ref({
  autoSyncBeforeLaunch: true,
  showSyncConfirmation: true,
  defaultConfigSyncMode: "new_only" as "overwrite" | "new_only" | "skip",
});

// Tabs Configuration
const tabs = [
  { id: "general", name: "General", icon: SettingsIcon },
  { id: "appearance", name: "Look & Feel", icon: Palette },
  { id: "sidebar", name: "Navigation", icon: Sliders },
  { id: "minecraft", name: "Launchers", icon: Globe },
  { id: "library", name: "Storage", icon: Database },
  { id: "shortcuts", name: "Keyboard", icon: Keyboard },
  { id: "about", name: "About", icon: Info },
];

const currentTabName = computed(() => {
  return tabs.find((t) => t.id === currentTab.value)?.name || "Settings";
});

// Accent color options
const accentColors = [
  { name: "purple", value: "263.4 70% 50.4%", class: "bg-purple-500" },
  { name: "blue", value: "217.2 91.2% 59.8%", class: "bg-blue-500" },
  { name: "green", value: "142.1 76.2% 36.3%", class: "bg-green-500" },
  { name: "red", value: "0 72.2% 50.6%", class: "bg-red-500" },
  { name: "orange", value: "24.6 95% 53.1%", class: "bg-orange-500" },
  { name: "pink", value: "330.4 81.2% 60.4%", class: "bg-pink-500" },
];

// Keyboard shortcuts
const shortcuts = [
  { keys: "Ctrl + F", action: "Search mods/modpacks" },
  { keys: "Ctrl + N", action: "Create modpack from selection" },
  { keys: "Ctrl + A", action: "Select all" },
  { keys: "Delete", action: "Delete selected" },
  { keys: "Escape", action: "Clear selection / Close dialog" },
  { keys: "1", action: "Switch to Grid view" },
  { keys: "2", action: "Switch to List view" },
  { keys: "3", action: "Switch to Compact view" },
];

// Helper function for slider input handling
function handleSliderInput(
  event: Event,
  property: keyof typeof customization.value
) {
  const target = event.target as HTMLInputElement;
  updateCustomization({ [property]: parseInt(target.value) });
}

// Helper function to calculate primary color preview
function getPrimaryColorPreview(): string {
  const hue = customization.value.primaryHue;
  const sat = customization.value.primarySaturation;
  const light = customization.value.primaryLightness || 55;

  if (hue < 0) {
    // Black range
    const lightness = ((hue + 10) / 10) * 10;
    return `hsl(0, 0%, ${lightness}%)`;
  } else if (hue > 360) {
    // White range
    const lightness = 90 + ((hue - 360) / 10) * 10;
    return `hsl(0, 0%, ${lightness}%)`;
  }
  // Normal color range - use user's saturation and lightness
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// Load settings
async function loadSettings() {
  if (!window.api) {
    apiAvailable.value = false;
    console.error("Backend API not available");
    return;
  }

  try {
    const mods = await window.api.mods.getAll();
    const modpacks = await window.api.modpacks.getAll();
    modCount.value = mods.length;
    modpackCount.value = modpacks.length;

    // Load API Key
    cfApiKey.value = await window.api.updates.getApiKey();
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

async function saveCfApiKey() {
  try {
    await window.api.updates.setApiKey(cfApiKey.value);
    toast.success("Connected ✓", "CurseForge API key saved.");
  } catch (err) {
    toast.error("Couldn't save", "API key wasn't saved. Try again.");
  }
}

async function checkForAppUpdates() {
  isCheckingUpdate.value = true;
  try {
    const result = await window.api.updates.checkAppUpdate();
    
    if (result.error) {
      toast.error("Update check failed", result.error);
    } else if (result.hasUpdate) {
      toast.info(
        `Update available: ${result.releaseName}`,
        `A new version (${result.latestVersion}) is available.`,
        10000
      );
      // Open the release page
      window.open(result.releaseUrl, "_blank");
    } else if (result.noReleases) {
      toast.success("You're up to date", `Running v${result.currentVersion} (development build).`);
    } else {
      toast.success("You're up to date", `Running the latest version (v${result.currentVersion}).`);
    }
  } catch (error: any) {
    toast.error("Update check failed", error.message || "Could not connect to GitHub.");
  } finally {
    isCheckingUpdate.value = false;
  }
}

async function applyAccentColor(color: (typeof accentColors)[0]) {
  accentColor.value = color.name;
  localStorage.setItem("modex:accent", color.name);
  document.documentElement.style.setProperty("--primary", color.value);
}

async function clearAllData() {
  const confirmed = await confirm({
    title: "Reset Everything",
    message:
      "This removes all your mods and packs. This can't be undone.\n\nAre you sure you want to continue?",
    variant: "danger",
    icon: "warning",
    confirmText: "Yes, reset everything",
    cancelText: "Keep my data",
  });

  if (!confirmed) {
    return;
  }

  isClearingData.value = true;

  try {
    // Delete modpacks first (they reference mods)
    const modpacks = await window.api.modpacks.getAll();
    for (const pack of modpacks) {
      await window.api.modpacks.delete(pack.id);
    }

    // Delete all mods using bulk API
    const mods = await window.api.mods.getAll();
    const modIds = mods.map((m) => m.id);
    if (modIds.length > 0) {
      await window.api.mods.bulkDelete(modIds);
    }

    await loadSettings();
    toast.success("Reset complete ✓", "All data has been cleared.");
  } catch (err) {
    toast.error(
      "Couldn't reset",
      "Something went wrong: " + (err as Error).message
    );
  } finally {
    isClearingData.value = false;
  }
}

async function refreshLibrary() {
  await loadSettings();
}

// Load instance sync settings
async function loadSyncSettings() {
  try {
    const settings = await window.api.settings.getInstanceSync();
    syncSettings.value = {
      autoSyncBeforeLaunch: settings.autoSyncBeforeLaunch ?? true,
      showSyncConfirmation: settings.showSyncConfirmation ?? true,
      defaultConfigSyncMode: settings.defaultConfigSyncMode ?? "new_only",
    };
  } catch (err) {
    console.error("Failed to load sync settings:", err);
  }
}

// Save instance sync settings
async function saveSyncSettings() {
  try {
    // Create a plain object copy to avoid IPC serialization issues with Vue proxies
    const settingsToSave = {
      autoSyncBeforeLaunch: syncSettings.value.autoSyncBeforeLaunch,
      showSyncConfirmation: syncSettings.value.showSyncConfirmation,
      defaultConfigSyncMode: syncSettings.value.defaultConfigSyncMode,
    };
    await window.api.settings.setInstanceSync(settingsToSave);
    toast.success("Saved ✓", "Sync preferences updated.");
  } catch (err) {
    console.error("Failed to save sync settings:", err);
    toast.error("Couldn't save", "Sync settings weren't saved.");
  }
}

onMounted(() => {
  // Load theme
  // Handled by App.vue initialization

  loadSettings();
  loadSyncSettings();
});
</script>

<template>
  <div class="flex h-full bg-background text-foreground overflow-hidden">
    <!-- Mobile Header -->
    <div class="md:hidden fixed top-0 left-0 right-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border">
      <div class="flex items-center gap-3 p-3">
        <SettingsIcon class="w-5 h-5 text-primary" />
        <h1 class="text-lg font-bold">Settings</h1>
      </div>
      <!-- Mobile Tab Navigation -->
      <div class="flex overflow-x-auto scrollbar-hide gap-1 px-2 pb-2">
        <button v-for="tab in tabs" :key="tab.id" @click="currentTab = tab.id"
          class="flex-shrink-0 px-3 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 text-sm font-medium whitespace-nowrap"
          :class="currentTab === tab.id
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted/50'
            ">
          <component :is="tab.icon" class="w-4 h-4" />
          <span class="hidden xs:inline">{{ tab.name }}</span>
        </button>
      </div>
    </div>

    <!-- Desktop Sidebar -->
    <div class="hidden md:flex w-64 flex-shrink-0 border-r border-border bg-card/30 flex-col">
      <div class="p-6 pb-4">
        <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon class="w-6 h-6 text-primary" />
          Settings
        </h1>
        <p class="text-xs text-muted-foreground mt-1">
          Manage your preferences
        </p>
      </div>

      <nav class="flex-1 px-3 space-y-1 overflow-y-auto">
        <button v-for="tab in tabs" :key="tab.id" @click="currentTab = tab.id"
          class="w-full text-left px-3 py-2.5 rounded-md flex items-center gap-3 transition-all duration-200 text-sm font-medium"
          :class="currentTab === tab.id
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            ">
          <component :is="tab.icon" class="w-4 h-4" />
          {{ tab.name }}
        </button>
      </nav>

      <div class="p-4 border-t border-border">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
            <span class="text-sm font-bold text-primary">M</span>
          </div>
          <div>
            <div class="text-sm font-medium">ModEx</div>
            <div class="text-xs text-muted-foreground">v{{ appVersion }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-auto bg-background pt-24 md:pt-0">
      <div class="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
        <div class="mb-6 md:mb-8">
          <h2 class="text-xl sm:text-2xl font-semibold tracking-tight">
            {{ currentTabName }}
          </h2>
          <p class="text-muted-foreground text-sm mt-1">
            Customize your {{ currentTabName.toLowerCase() }} settings
          </p>
        </div>

        <!-- API Warning Banner -->
        <div v-if="!apiAvailable"
          class="mb-6 bg-destructive/10 border border-destructive text-destructive rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle class="w-5 h-5 flex-shrink-0" />
          <div>
            <p class="font-medium">Backend API not available</p>
            <p class="text-sm opacity-80">Please restart the application.</p>
          </div>
        </div>

        <!-- General Tab -->
        <div v-if="currentTab === 'general'" class="space-y-8">
          <!-- API Keys -->
          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2">
              <Key class="w-4 h-4 text-primary" />
              CurseForge API
            </h3>
            <div class="p-5 rounded-lg border border-border/50 bg-card/50">
              <div class="space-y-4">
                <div class="space-y-2">
                  <label class="text-sm font-medium flex items-center gap-2">
                    API Key
                  </label>
                  <div class="flex flex-col sm:flex-row gap-2">
                    <Input v-model="cfApiKey" type="password" placeholder="Paste key here" class="flex-1" />
                    <Button variant="outline" @click="saveCfApiKey" class="w-full sm:w-auto">Save</Button>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    Required for browsing and updates.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <!-- Updates -->
          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2">
              <RefreshCw class="w-4 h-4 text-primary" />
              Updates
            </h3>
            <div class="p-4 sm:p-5 rounded-lg border border-border/50 bg-card/50">
              <div class="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
                <div>
                  <div class="font-medium">App Updates</div>
                  <div class="text-sm text-muted-foreground">
                    Check for new versions
                  </div>
                </div>
                <Button variant="outline" @click="checkForAppUpdates" :disabled="isCheckingUpdate"
                  class="gap-2 w-full sm:w-auto">
                  <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isCheckingUpdate }" />
                  {{ isCheckingUpdate ? "Checking..." : "Check Now" }}
                </Button>
              </div>
            </div>
          </section>

          <!-- Instance Sync Settings -->
          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2">
              <RefreshCw class="w-4 h-4 text-primary" />
              Sync Settings
            </h3>
            <div class="p-4 sm:p-5 rounded-lg border border-border/50 bg-card/50 space-y-5">
              <!-- Auto Sync Before Launch -->
              <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div>
                  <div class="font-medium">Auto-sync before launch</div>
                  <div class="text-sm text-muted-foreground">
                    Automatically sync mods when launching the game
                  </div>
                </div>
                <button @click="
                  syncSettings.autoSyncBeforeLaunch =
                  !syncSettings.autoSyncBeforeLaunch;
                saveSyncSettings();
                " class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0"
                  :class="syncSettings.autoSyncBeforeLaunch
                    ? 'bg-primary'
                    : 'bg-muted'
                    ">
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200"
                    :class="syncSettings.autoSyncBeforeLaunch
                      ? 'translate-x-6'
                      : 'translate-x-1'
                      " />
                </button>
              </div>

              <!-- Show Confirmation -->
              <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div>
                  <div class="font-medium">Show confirmation dialog</div>
                  <div class="text-sm text-muted-foreground">
                    Ask before syncing when differences are detected
                  </div>
                </div>
                <button @click="
                  syncSettings.showSyncConfirmation =
                  !syncSettings.showSyncConfirmation;
                saveSyncSettings();
                " class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0"
                  :class="syncSettings.showSyncConfirmation
                    ? 'bg-primary'
                    : 'bg-muted'
                    ">
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200"
                    :class="syncSettings.showSyncConfirmation
                      ? 'translate-x-6'
                      : 'translate-x-1'
                      " />
                </button>
              </div>

              <!-- Default Config Sync Mode -->
              <div class="space-y-2">
                <div>
                  <div class="font-medium">Default config sync mode</div>
                  <div class="text-sm text-muted-foreground">
                    How to handle config files during sync
                  </div>
                </div>
                <div class="flex flex-wrap gap-2 pt-1">
                  <button @click="
                    syncSettings.defaultConfigSyncMode = 'new_only';
                  saveSyncSettings();
                  " class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border" :class="syncSettings.defaultConfigSyncMode === 'new_only'
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                    ">
                    New Only
                  </button>
                  <button @click="
                    syncSettings.defaultConfigSyncMode = 'overwrite';
                  saveSyncSettings();
                  " class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border" :class="syncSettings.defaultConfigSyncMode === 'overwrite'
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                    ">
                    Overwrite
                  </button>
                  <button @click="
                    syncSettings.defaultConfigSyncMode = 'skip';
                  saveSyncSettings();
                  " class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border" :class="syncSettings.defaultConfigSyncMode === 'skip'
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                    ">
                    Skip
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- Appearance Tab -->
        <div v-if="currentTab === 'appearance'" class="space-y-8">
          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2">
              <Sun class="w-4 h-4 text-primary" />
              Theme
            </h3>
            <div class="p-5 rounded-lg border border-border/50 bg-card/50">
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <button v-for="t in themes" :key="t.id"
                  class="flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all hover:bg-muted/50 relative overflow-hidden group"
                  :class="currentTheme === t.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50'
                    " @click="setTheme(t.id)">
                  <div
                    class="w-12 h-12 rounded-full shadow-sm mb-1 relative flex items-center justify-center border border-border/20"
                    :class="t.color">
                    <Check v-if="currentTheme === t.id" class="w-6 h-6 text-white drop-shadow-md" />
                  </div>
                  <span class="text-sm font-medium">{{ t.name }}</span>
                </button>
              </div>
            </div>
          </section>

          <!-- Style Presets -->
          <section class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-medium flex items-center gap-2">
                <Sparkles class="w-4 h-4 text-primary" />
                Style Presets
              </h3>
              <Button variant="ghost" size="sm" @click="resetCustomization" class="gap-2">
                <RotateCcw class="w-4 h-4" />
                Reset
              </Button>
            </div>
            <div class="p-5 rounded-lg border border-border/50 bg-card/50">
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <button v-for="preset in stylePresets" :key="preset.id"
                  class="flex flex-col items-start gap-2 p-4 rounded-lg border-2 transition-all hover:bg-muted/50 text-left"
                  :class="customization.stylePreset === preset.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50'
                    " @click="applyStylePreset(preset.id)">
                  <div class="flex items-center gap-2 w-full">
                    <div class="w-4 h-4 rounded" :style="{
                      backgroundColor: preset.preview,
                      borderRadius:
                        preset.config.borderRadius !== undefined
                          ? preset.config.borderRadius + 'px'
                          : '4px',
                    }" />
                    <span class="text-sm font-medium flex-1">{{
                      preset.name
                    }}</span>
                    <Check v-if="customization.stylePreset === preset.id" class="w-4 h-4 text-primary" />
                  </div>
                  <span class="text-xs text-muted-foreground">{{
                    preset.description
                  }}</span>
                </button>
              </div>
            </div>
          </section>

          <!-- Custom Controls -->
          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2">
              <Sliders class="w-4 h-4 text-primary" />
              Custom Adjustments
            </h3>
            <div class="p-5 rounded-lg border border-border/50 bg-card/50 space-y-6">
              <!-- Primary Color Hue -->
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">Primary Color</label>
                  <div class="w-6 h-6 rounded-full border border-border"
                    :style="{ backgroundColor: getPrimaryColorPreview() }" />
                </div>
                <input type="range" min="-10" max="370" :value="customization.primaryHue"
                  @input="handleSliderInput($event, 'primaryHue')"
                  class="w-full h-2 rounded-lg appearance-none cursor-pointer" style="
                    background: linear-gradient(
                      to right,
                      hsl(0, 0%, 0%),
                      hsl(0, 0%, 10%),
                      hsl(0, 80%, 50%),
                      hsl(60, 80%, 50%),
                      hsl(120, 80%, 50%),
                      hsl(180, 80%, 50%),
                      hsl(240, 80%, 50%),
                      hsl(300, 80%, 50%),
                      hsl(360, 80%, 50%),
                      hsl(0, 0%, 90%),
                      hsl(0, 0%, 100%)
                    );
                  " />
                <div class="flex justify-between text-xs text-muted-foreground">
                  <span>Black</span>
                  <span>Red</span>
                  <span>Green</span>
                  <span>Cyan</span>
                  <span>Blue</span>
                  <span>Magenta</span>
                  <span>White</span>
                </div>
              </div>

              <!-- Saturation -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">Saturation</label>
                  <span class="text-sm text-muted-foreground">{{ customization.primarySaturation }}%</span>
                </div>
                <input type="range" min="0" max="100" :value="customization.primarySaturation"
                  @input="handleSliderInput($event, 'primarySaturation')"
                  class="w-full h-2 rounded-lg appearance-none cursor-pointer" :style="{
                    background: `linear-gradient(to right, hsl(${customization.primaryHue}, 0%, 50%), hsl(${customization.primaryHue}, 50%, 50%), hsl(${customization.primaryHue}, 100%, 50%))`,
                  }" />
              </div>

              <!-- Lightness -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">Lightness</label>
                  <span class="text-sm text-muted-foreground">{{ customization.primaryLightness || 55 }}%</span>
                </div>
                <input type="range" min="25" max="75" :value="customization.primaryLightness || 55"
                  @input="handleSliderInput($event, 'primaryLightness')"
                  class="w-full h-2 rounded-lg appearance-none cursor-pointer" :style="{
                    background: `linear-gradient(to right, hsl(${customization.primaryHue}, ${customization.primarySaturation}%, 25%), hsl(${customization.primaryHue}, ${customization.primarySaturation}%, 50%), hsl(${customization.primaryHue}, ${customization.primarySaturation}%, 75%))`,
                  }" />
              </div>

              <!-- Border Radius -->
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">Border Radius</label>
                  <span class="text-sm text-muted-foreground">{{ customization.borderRadius }}px</span>
                </div>
                <div class="flex items-center gap-4">
                  <Square class="w-4 h-4 text-muted-foreground" />
                  <input type="range" min="0" max="24" :value="customization.borderRadius"
                    @input="handleSliderInput($event, 'borderRadius')"
                    class="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary" />
                  <Circle class="w-4 h-4 text-muted-foreground" />
                </div>
                <!-- Preview boxes -->
                <div class="flex gap-3 justify-center pt-2">
                  <div class="w-12 h-12 bg-primary/20 border border-primary/40"
                    :style="{ borderRadius: customization.borderRadius + 'px' }" />
                  <div class="w-16 h-8 bg-primary/20 border border-primary/40"
                    :style="{ borderRadius: customization.borderRadius + 'px' }" />
                  <div class="w-8 h-8 bg-primary/20 border border-primary/40"
                    :style="{ borderRadius: customization.borderRadius + 'px' }" />
                </div>
              </div>

              <!-- Border Width -->
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">Border Width</label>
                  <span class="text-sm text-muted-foreground">{{ customization.borderWidth }}px</span>
                </div>
                <input type="range" min="0" max="4" :value="customization.borderWidth"
                  @input="handleSliderInput($event, 'borderWidth')"
                  class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary" />
              </div>

              <!-- Shadow Intensity -->
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">Shadow Intensity</label>
                  <span class="text-sm text-muted-foreground">{{ customization.shadowIntensity }}%</span>
                </div>
                <input type="range" min="0" max="100" :value="customization.shadowIntensity"
                  @input="handleSliderInput($event, 'shadowIntensity')"
                  class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary" />
              </div>

              <!-- Glass Effect Toggle -->
              <div class="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <label class="text-sm font-medium">Glass Effect</label>
                  <p class="text-xs text-muted-foreground">
                    Enable glassmorphism blur effects
                  </p>
                </div>
                <button @click="
                  updateCustomization({
                    glassEffect: !customization.glassEffect,
                  })
                  " class="relative w-12 h-6 rounded-full transition-colors"
                  :class="customization.glassEffect ? 'bg-primary' : 'bg-muted'">
                  <div class="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform" :class="customization.glassEffect
                    ? 'translate-x-7'
                    : 'translate-x-1'
                    " />
                </button>
              </div>
            </div>
          </section>
        </div>

        <!-- Minecraft Installations Tab -->
        <div v-if="currentTab === 'minecraft'" class="space-y-8">
          <section class="space-y-4">
            <MinecraftInstallations />
          </section>
        </div>

        <!-- Library Tab -->
        <div v-if="currentTab === 'library'" class="space-y-8">
          <section class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-medium flex items-center gap-2">
                <Database class="w-4 h-4 text-primary" />
                Statistics
              </h3>
              <Button variant="ghost" size="sm" @click="refreshLibrary" class="gap-2">
                <RefreshCw class="w-4 h-4" />
                Refresh
              </Button>
            </div>

            <div class="grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-4">
              <div
                class="p-4 sm:p-5 rounded-lg border border-border/50 bg-card/50 flex flex-col items-center justify-center text-center">
                <div class="text-2xl sm:text-3xl font-bold text-primary">
                  {{ modCount }}
                </div>
                <div class="text-sm text-muted-foreground mt-1">Total Mods</div>
              </div>
              <div
                class="p-4 sm:p-5 rounded-lg border border-border/50 bg-card/50 flex flex-col items-center justify-center text-center">
                <div class="text-2xl sm:text-3xl font-bold text-primary">
                  {{ modpackCount }}
                </div>
                <div class="text-sm text-muted-foreground mt-1">Modpacks</div>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2">
              <Database class="w-4 h-4 text-primary" />
              Storage Information
            </h3>
            <div class="p-5 rounded-lg border border-border/50 bg-card/50">
              <div class="flex items-start gap-3">
                <div class="p-2 rounded-lg bg-primary/10">
                  <Info class="w-5 h-5 text-primary" />
                </div>
                <div class="flex-1">
                  <div class="font-medium">Metadata-Only Storage</div>
                  <p class="text-sm text-muted-foreground mt-1">
                    ModEx stores mod and modpack information as metadata
                    references from CurseForge. Actual mod files are only
                    downloaded when you sync a modpack to a Minecraft
                    installation.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle class="w-4 h-4" />
              Danger Zone
            </h3>
            <div class="p-4 sm:p-5 rounded-xl border border-destructive/30 bg-destructive/5">
              <div class="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
                <div>
                  <div class="font-medium text-destructive">Reset Everything</div>
                  <div class="text-sm text-muted-foreground">
                    This removes all your mods and packs. This can't be undone.
                  </div>
                </div>
                <Button variant="destructive" @click="clearAllData" :disabled="isClearingData" class="w-full sm:w-auto">
                  <Trash2 class="w-4 h-4 mr-2" />
                  {{ isClearingData ? "Clearing..." : "Reset Everything" }}
                </Button>
              </div>
            </div>
          </section>
        </div>

        <!-- Sidebar Tab -->
        <div v-if="currentTab === 'sidebar'" class="space-y-8">
          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2">
              <PanelLeft class="w-4 h-4 text-primary" />
              Sidebar Layout
            </h3>
            <p class="text-sm text-muted-foreground">
              Customize the sidebar appearance and behavior.
            </p>

            <div class="space-y-6">
              <!-- Position Selection -->
              <div class="space-y-3">
                <label class="text-sm font-medium">Position</label>
                <div class="flex gap-3">
                  <button @click="setPosition('left')"
                    class="flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all" :class="sidebarSettings.position === 'left'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                      ">
                    <PanelLeft class="w-5 h-5" />
                    <span class="font-medium">Left</span>
                  </button>
                  <button @click="setPosition('right')"
                    class="flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all" :class="sidebarSettings.position === 'right'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                      ">
                    <PanelRight class="w-5 h-5" />
                    <span class="font-medium">Right</span>
                  </button>
                </div>
              </div>

              <!-- Collapsed Mode -->
              <div
                class="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg bg-muted/50 border border-border">
                <div class="flex-1">
                  <p class="font-medium">Collapsed Mode</p>
                  <p class="text-sm text-muted-foreground">
                    Show only icons in sidebar
                  </p>
                </div>
                <button @click="setCollapsed(!sidebarSettings.collapsed)"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
                  :class="sidebarSettings.collapsed ? 'bg-primary' : 'bg-muted'">
                  <span class="inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform"
                    :class="sidebarSettings.collapsed
                      ? 'translate-x-6'
                      : 'translate-x-1'
                      " />
                </button>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2">
              <Eye class="w-4 h-4 text-primary" />
              Navigation Items
            </h3>
            <p class="text-sm text-muted-foreground">
              Toggle which items appear in the sidebar navigation.
            </p>

            <div class="space-y-2">
              <div v-for="item in sidebarSettings.items" :key="item.id"
                class="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <div class="flex items-center gap-3">
                  <component :is="sidebarIconMap[item.icon] || Package" class="w-5 h-5 text-muted-foreground" />
                  <span class="font-medium">{{ item.name }}</span>
                </div>
                <button @click="toggleItemEnabled(item.id)" class="p-1.5 rounded-md transition-colors" :class="item.enabled
                  ? 'text-primary bg-primary/10 hover:bg-primary/20'
                  : 'text-muted-foreground hover:bg-muted'
                  ">
                  <component :is="item.enabled ? Eye : EyeOff" class="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div>
                <h3 class="text-lg font-medium">Reset Sidebar</h3>
                <p class="text-sm text-muted-foreground">
                  Restore sidebar to default settings
                </p>
              </div>
              <Button variant="outline" @click="resetSidebarSettings" class="w-full sm:w-auto">
                <RotateCcw class="w-4 h-4 mr-2" />
                Reset to Default
              </Button>
            </div>
          </section>
        </div>

        <!-- Shortcuts Tab -->
        <div v-if="currentTab === 'shortcuts'" class="space-y-8">
          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2">
              <Keyboard class="w-4 h-4 text-primary" />
              Keyboard Shortcuts
            </h3>
            <div class="rounded-lg border border-border/50 bg-card/50 overflow-hidden">
              <div class="divide-y divide-border">
                <div v-for="shortcut in shortcuts" :key="shortcut.keys"
                  class="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                  <span class="text-sm font-medium">{{ shortcut.action }}</span>
                  <kbd class="px-2 py-1 bg-muted text-xs rounded-md font-mono border border-border shadow-sm">
                    {{ shortcut.keys }}
                  </kbd>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- About Tab -->
        <div v-if="currentTab === 'about'" class="space-y-8">
          <div class="flex flex-col items-center justify-center py-8 sm:py-12 text-center space-y-4 sm:space-y-6">
            <div
              class="w-20 h-20 sm:w-24 sm:h-24 bg-primary/10 rounded-2xl sm:rounded-3xl flex items-center justify-center mb-2 sm:mb-4">
              <span class="text-4xl sm:text-5xl font-bold text-primary">M</span>
            </div>

            <div>
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">
                ModEx
              </h2>
              <p class="text-muted-foreground mt-2 text-base sm:text-lg">
                The modern Minecraft mod manager
              </p>
            </div>

            <div class="flex flex-wrap justify-center gap-2 sm:gap-4 mt-4">
              <div class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-muted text-xs sm:text-sm font-medium">
                v{{ appVersion }}
              </div>
              <div class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-muted text-xs sm:text-sm font-medium">
                Electron + Vue 3
              </div>
            </div>

            <div class="pt-6 sm:pt-8 text-sm text-muted-foreground">
              <p class="flex items-center justify-center gap-1">
                Made with
                <Heart class="w-4 h-4 text-red-500 fill-red-500" /> for the
                community
              </p>
              <p class="mt-2">© {{ new Date().getFullYear() }} ModEx Team</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
