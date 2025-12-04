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
} from "lucide-vue-next";

// App version from package.json
const appVersion = __APP_VERSION__;

// Settings State
const libraryPath = ref("");
const theme = ref("dark");
const modCount = ref(0);
const modpackCount = ref(0);
const isClearingData = ref(false);
const apiAvailable = ref(true);

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

function saveTheme(newTheme: string) {
  theme.value = newTheme;
  localStorage.setItem("modex:theme", newTheme);
  document.documentElement.classList.toggle("light", newTheme === "light");
}

async function clearAllData() {
  if (
    !confirm(
      "This will delete ALL mods and modpacks. This action cannot be undone. Are you sure?"
    )
  ) {
    return;
  }

  isClearingData.value = true;

  try {
    // Delete all modpacks first
    const modpacks = await window.api.modpacks.getAll();
    for (const pack of modpacks) {
      await window.api.modpacks.delete(pack.id);
    }

    // Then delete all mods
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

onMounted(() => {
  // Load theme from localStorage
  theme.value = localStorage.getItem("modex:theme") || "dark";

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
        <p class="text-sm opacity-80">Please restart the application to restore functionality.</p>
      </div>
    </div>

    <!-- Header -->
    <div>
      <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3">
        <SettingsIcon class="w-8 h-8" />
        Settings
      </h1>
      <p class="text-muted-foreground mt-1">
        Configure ModEx preferences and manage data
      </p>
    </div>

    <!-- Settings Sections -->
    <div class="grid gap-6 max-w-2xl">
      <!-- Library Location -->
      <div class="glass-card rounded-lg p-4 space-y-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <FolderOpen class="w-5 h-5 text-primary" />
          Storage Location
        </h2>

        <div class="space-y-2">
          <label class="text-sm font-medium">Mod Library</label>
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
          <p class="text-xs text-muted-foreground">
            All mods are stored here. Modpacks are in the "modpacks" subfolder.
          </p>
        </div>
      </div>

      <!-- Appearance -->
      <div class="glass-card rounded-lg p-4 space-y-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Palette class="w-5 h-5 text-primary" />
          Appearance
        </h2>

        <div class="space-y-2">
          <label class="text-sm font-medium">Theme</label>
          <div class="flex gap-2">
            <Button
              :variant="theme === 'dark' ? 'default' : 'outline'"
              size="sm"
              @click="saveTheme('dark')"
            >
              Dark
            </Button>
            <Button
              :variant="theme === 'light' ? 'default' : 'outline'"
              size="sm"
              @click="saveTheme('light')"
            >
              Light
            </Button>
          </div>
        </div>
      </div>

      <!-- Database -->
      <div class="glass-card rounded-lg p-4 space-y-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Database class="w-5 h-5 text-primary" />
          Database
        </h2>

        <div class="grid grid-cols-2 gap-4">
          <div class="p-3 bg-secondary/30 rounded-lg">
            <div class="text-2xl font-bold">{{ modCount }}</div>
            <div class="text-xs text-muted-foreground">Total Mods</div>
          </div>
          <div class="p-3 bg-secondary/30 rounded-lg">
            <div class="text-2xl font-bold">{{ modpackCount }}</div>
            <div class="text-xs text-muted-foreground">Total Modpacks</div>
          </div>
        </div>

        <div class="pt-2 border-t">
          <Button
            variant="destructive"
            class="gap-2"
            @click="clearAllData"
            :loading="isClearingData"
          >
            <Trash2 class="w-4 h-4" />
            Clear All Data
          </Button>
          <p class="text-xs text-muted-foreground mt-2">
            This will permanently delete all mods and modpacks from the
            database.
          </p>
        </div>
      </div>

      <!-- About -->
      <div class="glass-card rounded-lg p-4 space-y-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Info class="w-5 h-5 text-primary" />
          About
        </h2>

        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Application</span>
            <span class="font-medium">ModEx</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Version</span>
            <span class="font-medium">{{ appVersion }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Framework</span>
            <span class="font-medium">Electron + Vue 3</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
