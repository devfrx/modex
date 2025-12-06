<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import {
  Settings as SettingsIcon,
  FolderOpen,
  Database,
  Palette,
  Info,
  Trash2,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  Heart,
} from "lucide-vue-next";

// App version from package.json
const appVersion = __APP_VERSION__;
const toast = useToast();
const { confirm } = useDialog();

// Settings State
const libraryPath = ref("");
const theme = ref<"dark" | "light" | "system">("dark");
const accentColor = ref("purple");
const modCount = ref(0);
const modpackCount = ref(0);
const totalSize = ref("0 MB");
const isClearingData = ref(false);
const apiAvailable = ref(true);

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
  { keys: "Ctrl + N", action: "Create new modpack" },
  { keys: "Ctrl + I", action: "Import mods" },
  { keys: "Ctrl + A", action: "Select all" },
  { keys: "Delete", action: "Delete selected" },
  { keys: "Escape", action: "Clear selection / Close" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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

    // Metadata-only mode: no local file storage
    totalSize.value = "N/A (metadata only)";
    libraryPath.value = "Mods are stored as metadata references only";
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

async function openLibraryFolder() {
  // Not available in metadata-only mode
  toast.info(
    "Not Available",
    "Open Library is not available. Mods are stored as API references only, not as local files."
  );
}

function applyTheme(newTheme: "dark" | "light" | "system") {
  theme.value = newTheme;
  localStorage.setItem("modex:theme", newTheme);

  if (newTheme === "system") {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    document.documentElement.classList.toggle("light", !prefersDark);
  } else {
    document.documentElement.classList.toggle("light", newTheme === "light");
  }
}

function applyAccentColor(color: (typeof accentColors)[0]) {
  accentColor.value = color.name;
  localStorage.setItem("modex:accent", color.name);
  document.documentElement.style.setProperty("--primary", color.value);
}

async function clearAllData() {
  const confirmed = await confirm({
    title: "Clear All Data",
    message: "This will delete ALL mods and modpacks permanently.\n\nThis action cannot be undone. Are you sure?",
    variant: "danger",
    icon: "warning",
    confirmText: "Delete Everything",
    cancelText: "Cancel"
  });

  if (!confirmed) {
    return;
  }

  isClearingData.value = true;

  try {
    const modpacks = await window.api.modpacks.getAll();
    for (const pack of modpacks) {
      await window.api.modpacks.delete(pack.id);
    }

    const mods = await window.api.mods.getAll();
    for (const mod of mods) {
      await window.api.mods.delete(mod.id);
    }

    await loadSettings();
    toast.success("Data Cleared", "All data cleared successfully!");
  } catch (err) {
    toast.error("Clear Failed", "Failed to clear data: " + (err as Error).message);
  } finally {
    isClearingData.value = false;
  }
}

async function refreshLibrary() {
  await loadSettings();
}

onMounted(() => {
  // Load theme
  const savedTheme =
    (localStorage.getItem("modex:theme") as "dark" | "light" | "system") ||
    "dark";
  theme.value = savedTheme;
  applyTheme(savedTheme);

  // Load accent color
  const savedAccent = localStorage.getItem("modex:accent") || "purple";
  accentColor.value = savedAccent;
  const color = accentColors.find((c) => c.name === savedAccent);
  if (color) {
    document.documentElement.style.setProperty("--primary", color.value);
  }

  // Listen for system theme changes
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (theme.value === "system") {
        document.documentElement.classList.toggle("light", !e.matches);
      }
    });

  loadSettings();
});
</script>

<template>
  <div class="h-full flex flex-col bg-[#0a0a0a]">
    <!-- Compact Header -->
    <div class="shrink-0 px-3 sm:px-6 py-3 sm:py-4 border-b border-white/5">
      <div class="flex items-center gap-2 sm:gap-3">
        <div class="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
          <SettingsIcon class="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        </div>
        <div>
          <h1 class="text-base sm:text-lg font-semibold tracking-tight">Settings</h1>
          <p class="text-[10px] sm:text-xs text-muted-foreground">
            Preferences & library management
          </p>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <!-- API Warning Banner -->
      <div v-if="!apiAvailable"
        class="bg-destructive/10 border border-destructive text-destructive rounded-lg p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
        <AlertTriangle class="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
        <div>
          <p class="font-medium text-sm sm:text-base">Backend API not available</p>
          <p class="text-xs sm:text-sm opacity-80">Please restart the application.</p>
        </div>
      </div>

      <!-- Settings Sections -->
      <div class="grid gap-4 sm:gap-6 max-w-3xl">
        <!-- Appearance -->
        <div class="glass-card rounded-lg p-4 sm:p-5 space-y-4 sm:space-y-5">
          <h2 class="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Palette class="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            Appearance
          </h2>

          <!-- Theme Selection -->
          <div class="space-y-2 sm:space-y-3">
            <label class="text-xs sm:text-sm font-medium">Theme</label>
            <div class="flex flex-wrap gap-2">
              <Button :variant="theme === 'dark' ? 'default' : 'outline'" size="sm"
                class="gap-1.5 sm:gap-2 h-7 sm:h-8 text-xs sm:text-sm" @click="applyTheme('dark')">
                <Moon class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Dark
              </Button>
              <Button :variant="theme === 'light' ? 'default' : 'outline'" size="sm"
                class="gap-1.5 sm:gap-2 h-7 sm:h-8 text-xs sm:text-sm" @click="applyTheme('light')">
                <Sun class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Light
              </Button>
              <Button :variant="theme === 'system' ? 'default' : 'outline'" size="sm"
                class="gap-1.5 sm:gap-2 h-7 sm:h-8 text-xs sm:text-sm" @click="applyTheme('system')">
                <Monitor class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                System
              </Button>
            </div>
          </div>

          <!-- Accent Color -->
          <div class="space-y-2 sm:space-y-3">
            <label class="text-xs sm:text-sm font-medium">Accent Color</label>
            <div class="flex gap-2">
              <button v-for="color in accentColors" :key="color.name" :class="[
                color.class,
                'w-7 h-7 sm:w-8 sm:h-8 rounded-full transition-all hover:scale-110',
                accentColor === color.name
                  ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground'
                  : '',
              ]" :title="color.name" @click="applyAccentColor(color)" />
            </div>
          </div>
        </div>

        <!-- Storage Location -->
        <div class="glass-card rounded-lg p-4 sm:p-5 space-y-3 sm:space-y-4">
          <h2 class="text-base sm:text-lg font-semibold flex items-center gap-2">
            <FolderOpen class="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            Storage Location
          </h2>

          <div class="space-y-2">
            <label class="text-xs sm:text-sm font-medium">Mod Library Path</label>
            <div class="flex flex-col sm:flex-row gap-2">
              <Input v-model="libraryPath" readonly class="flex-1 font-mono text-xs h-8 sm:h-9" />
              <Button variant="outline" @click="openLibraryFolder"
                class="gap-1.5 sm:gap-2 h-8 sm:h-9 text-xs sm:text-sm">
                <ExternalLink class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Open
              </Button>
            </div>
          </div>
        </div>

        <!-- Library Statistics -->
        <div class="glass-card rounded-lg p-4 sm:p-5 space-y-3 sm:space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base sm:text-lg font-semibold flex items-center gap-2">
              <Database class="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              Library Statistics
            </h2>
            <Button variant="ghost" size="sm" @click="refreshLibrary" class="gap-2">
              <RefreshCw class="w-4 h-4" />
              Refresh
            </Button>
          </div>

          <div class="grid grid-cols-1 xs:grid-cols-3 gap-3 sm:gap-4">
            <div class="p-3 sm:p-4 bg-secondary/30 rounded-lg text-center">
              <div class="text-2xl sm:text-3xl font-bold text-primary">{{ modCount }}</div>
              <div class="text-[10px] sm:text-xs text-muted-foreground mt-1">Total Mods</div>
            </div>
            <div class="p-3 sm:p-4 bg-secondary/30 rounded-lg text-center">
              <div class="text-2xl sm:text-3xl font-bold text-primary">
                {{ modpackCount }}
              </div>
              <div class="text-[10px] sm:text-xs text-muted-foreground mt-1">Modpacks</div>
            </div>
            <div class="p-3 sm:p-4 bg-secondary/30 rounded-lg text-center">
              <div class="text-2xl sm:text-3xl font-bold text-primary">{{ totalSize }}</div>
              <div class="text-[10px] sm:text-xs text-muted-foreground mt-1">Total Size</div>
            </div>
          </div>
        </div>

        <!-- Keyboard Shortcuts -->
        <div class="glass-card rounded-lg p-4 sm:p-5 space-y-3 sm:space-y-4">
          <h2 class="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Keyboard class="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            Keyboard Shortcuts
          </h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div v-for="shortcut in shortcuts" :key="shortcut.keys"
              class="flex items-center justify-between p-2 bg-secondary/20 rounded">
              <span class="text-xs sm:text-sm text-muted-foreground">{{
                shortcut.action
                }}</span>
              <kbd class="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-secondary text-[10px] sm:text-xs rounded font-mono">{{
                shortcut.keys
                }}</kbd>
            </div>
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="glass-card rounded-lg p-4 sm:p-5 space-y-3 sm:space-y-4 border-destructive/50">
          <h2 class="text-base sm:text-lg font-semibold flex items-center gap-2 text-destructive">
            <AlertTriangle class="w-4 h-4 sm:w-5 sm:h-5" />
            Danger Zone
          </h2>

          <div
            class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-destructive/10 rounded-lg">
            <div>
              <p class="font-medium text-sm sm:text-base">Clear All Data</p>
              <p class="text-[10px] sm:text-xs text-muted-foreground">
                Permanently delete all mods and modpacks.
              </p>
            </div>
            <Button variant="destructive" class="gap-1.5 sm:gap-2 h-8 sm:h-9 text-xs sm:text-sm w-full sm:w-auto"
              @click="clearAllData" :disabled="isClearingData">
              <Trash2 class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {{ isClearingData ? "Clearing..." : "Clear All" }}
            </Button>
          </div>
        </div>

        <!-- About -->
        <div class="glass-card rounded-lg p-4 sm:p-5 space-y-3 sm:space-y-4">
          <h2 class="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Info class="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            About ModEx
          </h2>

          <div class="space-y-3">
            <div class="flex items-center gap-3 sm:gap-4">
              <div class="w-12 h-12 sm:w-16 sm:h-16 bg-primary/20 rounded-xl flex items-center justify-center">
                <span class="text-2xl sm:text-3xl font-bold text-primary">M</span>
              </div>
              <div>
                <h3 class="text-lg sm:text-xl font-bold">ModEx</h3>
                <p class="text-xs sm:text-sm text-muted-foreground">Minecraft Mod Manager</p>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
              <div class="flex justify-between p-2 bg-secondary/20 rounded">
                <span class="text-muted-foreground">Version</span>
                <span class="font-medium">{{ appVersion }}</span>
              </div>
              <div class="flex justify-between p-2 bg-secondary/20 rounded">
                <span class="text-muted-foreground">Framework</span>
                <span class="font-medium">Electron + Vue 3</span>
              </div>
            </div>

            <p class="text-[10px] sm:text-xs text-muted-foreground pt-2 flex items-center gap-1">
              Made with
              <Heart class="w-3 h-3 text-red-500 fill-red-500" /> for
              Minecraft modders
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
