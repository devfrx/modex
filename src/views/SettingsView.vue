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
} from "lucide-vue-next";

// Settings State
const gameDirectory = ref("");
const modsDirectory = ref("");
const theme = ref("dark");
const autoScan = ref(true);
const dbPath = ref("");
const dbSize = ref("");
const modCount = ref(0);
const modpackCount = ref(0);
const isClearingData = ref(false);

// Load settings
async function loadSettings() {
  if (!window.api) return;

  try {
    const mods = await window.api.mods.getAll();
    const modpacks = await window.api.modpacks.getAll();
    modCount.value = mods.length;
    modpackCount.value = modpacks.length;
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

async function selectGameDirectory() {
  if (!window.api) return;
  const folder = await window.api.scanner.selectFolder();
  if (folder) {
    gameDirectory.value = folder;
    // Save to localStorage
    localStorage.setItem("modex:gameDirectory", folder);
  }
}

async function selectModsDirectory() {
  if (!window.api) return;
  const folder = await window.api.scanner.selectFolder();
  if (folder) {
    modsDirectory.value = folder;
    localStorage.setItem("modex:modsDirectory", folder);
  }
}

function saveTheme(newTheme: string) {
  theme.value = newTheme;
  localStorage.setItem("modex:theme", newTheme);
  document.documentElement.classList.toggle("light", newTheme === "light");
}

async function clearAllData() {
  if (
    !confirm(
      "This will delete ALL mods and modpacks from the database. Are you sure?"
    )
  ) {
    return;
  }

  isClearingData.value = true;

  try {
    // Delete all modpacks first
    const modpacks = await window.api.modpacks.getAll();
    for (const pack of modpacks) {
      await window.api.modpacks.delete(pack.id!);
    }

    // Then delete all mods
    const mods = await window.api.mods.getAll();
    for (const mod of mods) {
      await window.api.mods.delete(mod.id!);
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
  // Load settings from localStorage
  gameDirectory.value = localStorage.getItem("modex:gameDirectory") || "";
  modsDirectory.value = localStorage.getItem("modex:modsDirectory") || "";
  theme.value = localStorage.getItem("modex:theme") || "dark";
  autoScan.value = localStorage.getItem("modex:autoScan") !== "false";

  loadSettings();
});
</script>

<template>
  <div class="p-6 h-full flex flex-col space-y-6 overflow-auto">
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
      <!-- Directories -->
      <div class="glass-card rounded-lg p-4 space-y-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <FolderOpen class="w-5 h-5 text-primary" />
          Directories
        </h2>

        <div class="space-y-2">
          <label class="text-sm font-medium">Game Directory</label>
          <div class="flex gap-2">
            <Input
              v-model="gameDirectory"
              placeholder="Select Minecraft directory..."
              readonly
              class="flex-1"
            />
            <Button variant="outline" @click="selectGameDirectory">
              Browse
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            The main Minecraft installation folder (.minecraft)
          </p>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Mods Directory</label>
          <div class="flex gap-2">
            <Input
              v-model="modsDirectory"
              placeholder="Select mods folder..."
              readonly
              class="flex-1"
            />
            <Button variant="outline" @click="selectModsDirectory">
              Browse
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            Default folder to scan for mods
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
            <span class="font-medium">1.0.0</span>
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
