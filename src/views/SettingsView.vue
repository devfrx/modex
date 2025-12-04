<script setup lang="ts">
import { ref, onMounted } from "vue";
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
    
    // Calculate total size
    const totalBytes = mods.reduce((sum, mod) => sum + (mod.size || 0), 0);
    totalSize.value = formatBytes(totalBytes);
    
    // Get library path
    libraryPath.value = await window.api.scanner.getLibraryPath();
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

async function openLibraryFolder() {
  if (!window.api) return;
  await window.api.scanner.openLibrary();
}

function applyTheme(newTheme: "dark" | "light" | "system") {
  theme.value = newTheme;
  localStorage.setItem("modex:theme", newTheme);
  
  if (newTheme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("light", !prefersDark);
  } else {
    document.documentElement.classList.toggle("light", newTheme === "light");
  }
}

function applyAccentColor(color: typeof accentColors[0]) {
  accentColor.value = color.name;
  localStorage.setItem("modex:accent", color.name);
  document.documentElement.style.setProperty("--primary", color.value);
}

async function clearAllData() {
  if (
    !confirm(
      "⚠️ This will delete ALL mods and modpacks permanently.\n\nThis action cannot be undone. Are you sure?"
    )
  ) {
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
    alert("All data cleared successfully!");
  } catch (err) {
    alert("Failed to clear data: " + (err as Error).message);
  } finally {
    isClearingData.value = false;
  }
}

async function refreshLibrary() {
  await loadSettings();
}

onMounted(() => {
  // Load theme
  const savedTheme = localStorage.getItem("modex:theme") as "dark" | "light" | "system" || "dark";
  theme.value = savedTheme;
  applyTheme(savedTheme);
  
  // Load accent color
  const savedAccent = localStorage.getItem("modex:accent") || "purple";
  accentColor.value = savedAccent;
  const color = accentColors.find(c => c.name === savedAccent);
  if (color) {
    document.documentElement.style.setProperty("--primary", color.value);
  }

  // Listen for system theme changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (theme.value === "system") {
      document.documentElement.classList.toggle("light", !e.matches);
    }
  });

  loadSettings();
});
</script>

<template>
  <div class="p-6 h-full flex flex-col space-y-6 overflow-auto">
    <!-- API Warning Banner -->
    <div
      v-if="!apiAvailable"
      class="bg-destructive/10 border border-destructive text-destructive rounded-lg p-4 flex items-center gap-3"
    >
      <AlertTriangle class="w-5 h-5 flex-shrink-0" />
      <div>
        <p class="font-medium">Backend API not available</p>
        <p class="text-sm opacity-80">Please restart the application.</p>
      </div>
    </div>

    <!-- Header -->
    <div>
      <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3">
        <SettingsIcon class="w-8 h-8" />
        Settings
      </h1>
      <p class="text-muted-foreground mt-1">
        Configure ModEx preferences and manage your library
      </p>
    </div>

    <!-- Settings Sections -->
    <div class="grid gap-6 max-w-3xl">
      <!-- Appearance -->
      <div class="glass-card rounded-lg p-5 space-y-5">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Palette class="w-5 h-5 text-primary" />
          Appearance
        </h2>

        <!-- Theme Selection -->
        <div class="space-y-3">
          <label class="text-sm font-medium">Theme</label>
          <div class="flex gap-2">
            <Button
              :variant="theme === 'dark' ? 'default' : 'outline'"
              size="sm"
              class="gap-2"
              @click="applyTheme('dark')"
            >
              <Moon class="w-4 h-4" />
              Dark
            </Button>
            <Button
              :variant="theme === 'light' ? 'default' : 'outline'"
              size="sm"
              class="gap-2"
              @click="applyTheme('light')"
            >
              <Sun class="w-4 h-4" />
              Light
            </Button>
            <Button
              :variant="theme === 'system' ? 'default' : 'outline'"
              size="sm"
              class="gap-2"
              @click="applyTheme('system')"
            >
              <Monitor class="w-4 h-4" />
              System
            </Button>
          </div>
        </div>

        <!-- Accent Color -->
        <div class="space-y-3">
          <label class="text-sm font-medium">Accent Color</label>
          <div class="flex gap-2">
            <button
              v-for="color in accentColors"
              :key="color.name"
              :class="[
                color.class,
                'w-8 h-8 rounded-full transition-all hover:scale-110',
                accentColor === color.name ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground' : ''
              ]"
              :title="color.name"
              @click="applyAccentColor(color)"
            />
          </div>
        </div>
      </div>

      <!-- Storage Location -->
      <div class="glass-card rounded-lg p-5 space-y-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <FolderOpen class="w-5 h-5 text-primary" />
          Storage Location
        </h2>

        <div class="space-y-2">
          <label class="text-sm font-medium">Mod Library Path</label>
          <div class="flex gap-2">
            <Input
              v-model="libraryPath"
              readonly
              class="flex-1 font-mono text-xs"
            />
            <Button variant="outline" @click="openLibraryFolder" class="gap-2">
              <ExternalLink class="w-4 h-4" />
              Open
            </Button>
          </div>
        </div>
      </div>

      <!-- Library Statistics -->
      <div class="glass-card rounded-lg p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold flex items-center gap-2">
            <Database class="w-5 h-5 text-primary" />
            Library Statistics
          </h2>
          <Button variant="ghost" size="sm" @click="refreshLibrary" class="gap-2">
            <RefreshCw class="w-4 h-4" />
            Refresh
          </Button>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div class="p-4 bg-secondary/30 rounded-lg text-center">
            <div class="text-3xl font-bold text-primary">{{ modCount }}</div>
            <div class="text-xs text-muted-foreground mt-1">Total Mods</div>
          </div>
          <div class="p-4 bg-secondary/30 rounded-lg text-center">
            <div class="text-3xl font-bold text-primary">{{ modpackCount }}</div>
            <div class="text-xs text-muted-foreground mt-1">Modpacks</div>
          </div>
          <div class="p-4 bg-secondary/30 rounded-lg text-center">
            <div class="text-3xl font-bold text-primary">{{ totalSize }}</div>
            <div class="text-xs text-muted-foreground mt-1">Total Size</div>
          </div>
        </div>
      </div>

      <!-- Keyboard Shortcuts -->
      <div class="glass-card rounded-lg p-5 space-y-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Keyboard class="w-5 h-5 text-primary" />
          Keyboard Shortcuts
        </h2>

        <div class="grid grid-cols-2 gap-2">
          <div
            v-for="shortcut in shortcuts"
            :key="shortcut.keys"
            class="flex items-center justify-between p-2 bg-secondary/20 rounded"
          >
            <span class="text-sm text-muted-foreground">{{ shortcut.action }}</span>
            <kbd class="px-2 py-1 bg-secondary text-xs rounded font-mono">{{ shortcut.keys }}</kbd>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="glass-card rounded-lg p-5 space-y-4 border-destructive/50">
        <h2 class="text-lg font-semibold flex items-center gap-2 text-destructive">
          <AlertTriangle class="w-5 h-5" />
          Danger Zone
        </h2>

        <div class="flex items-center justify-between p-4 bg-destructive/10 rounded-lg">
          <div>
            <p class="font-medium">Clear All Data</p>
            <p class="text-xs text-muted-foreground">
              Permanently delete all mods and modpacks.
            </p>
          </div>
          <Button
            variant="destructive"
            class="gap-2"
            @click="clearAllData"
            :disabled="isClearingData"
          >
            <Trash2 class="w-4 h-4" />
            {{ isClearingData ? "Clearing..." : "Clear All" }}
          </Button>
        </div>
      </div>

      <!-- About -->
      <div class="glass-card rounded-lg p-5 space-y-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Info class="w-5 h-5 text-primary" />
          About ModEx
        </h2>

        <div class="space-y-3">
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 bg-primary/20 rounded-xl flex items-center justify-center">
              <span class="text-3xl font-bold text-primary">M</span>
            </div>
            <div>
              <h3 class="text-xl font-bold">ModEx</h3>
              <p class="text-sm text-muted-foreground">Minecraft Mod Manager</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 text-sm">
            <div class="flex justify-between p-2 bg-secondary/20 rounded">
              <span class="text-muted-foreground">Version</span>
              <span class="font-medium">{{ appVersion }}</span>
            </div>
            <div class="flex justify-between p-2 bg-secondary/20 rounded">
              <span class="text-muted-foreground">Framework</span>
              <span class="font-medium">Electron + Vue 3</span>
            </div>
          </div>

          <p class="text-xs text-muted-foreground pt-2 flex items-center gap-1">
            Made with <Heart class="w-3 h-3 text-red-500 fill-red-500" /> for Minecraft modders
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
