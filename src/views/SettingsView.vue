<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
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
  Globe,
  Key,
  Check,
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
const cfApiKey = ref("");
const isCheckingUpdate = ref(false);
const currentTab = ref("general");

// Tabs Configuration
const tabs = [
  { id: "general", name: "General", icon: SettingsIcon },
  { id: "appearance", name: "Appearance", icon: Palette },
  { id: "library", name: "Library", icon: Database },
  { id: "shortcuts", name: "Shortcuts", icon: Keyboard },
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

    // Load API Key
    cfApiKey.value = await window.api.updates.getApiKey("curseforge");
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

async function saveCfApiKey() {
  try {
    await window.api.updates.setApiKey("curseforge", cfApiKey.value);
    toast.success("Saved", "CurseForge API Key updated");
  } catch (err) {
    toast.error("Error", "Failed to save API Key");
  }
}

async function checkForAppUpdates() {
  isCheckingUpdate.value = true;
  // Mock update check for now
  setTimeout(() => {
    isCheckingUpdate.value = false;
    toast.success("Up to Date", "You are using the latest version of ModEx.");
  }, 1500);
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
    message:
      "This will delete ALL mods and modpacks permanently.\n\nThis action cannot be undone. Are you sure?",
    variant: "danger",
    icon: "warning",
    confirmText: "Delete Everything",
    cancelText: "Cancel",
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
    toast.error(
      "Clear Failed",
      "Failed to clear data: " + (err as Error).message
    );
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
  <div class="flex h-full bg-background text-foreground overflow-hidden">
    <!-- Sidebar -->
    <div class="w-64 flex-shrink-0 border-r border-border bg-card/30 flex flex-col">
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
    <div class="flex-1 overflow-auto bg-background">
      <div class="max-w-3xl mx-auto p-8">
        <div class="mb-8">
          <h2 class="text-2xl font-semibold tracking-tight">
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
              API Configuration
            </h3>
            <div class="p-5 rounded-xl border border-border bg-card/50">
              <div class="space-y-4">
                <div class="space-y-2">
                  <label class="text-sm font-medium flex items-center gap-2">
                    CurseForge API Key
                  </label>
                  <div class="flex gap-2">
                    <Input v-model="cfApiKey" type="password" placeholder="Enter your API Key (Optional)"
                      class="flex-1" />
                    <Button variant="outline" @click="saveCfApiKey">Save</Button>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    Leave empty to use the built-in shared key. Required only
                    for high-traffic usage.
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
            <div class="p-5 rounded-xl border border-border bg-card/50">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">Application Updates</div>
                  <div class="text-sm text-muted-foreground">
                    Check for the latest version of ModEx
                  </div>
                </div>
                <Button variant="outline" @click="checkForAppUpdates" :disabled="isCheckingUpdate" class="gap-2">
                  <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isCheckingUpdate }" />
                  {{ isCheckingUpdate ? "Checking..." : "Check Now" }}
                </Button>
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
            <div class="p-5 rounded-xl border border-border bg-card/50">
              <div class="grid grid-cols-3 gap-4">
                <button
                  class="flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all hover:bg-muted/50"
                  :class="theme === 'light'
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent'
                    " @click="applyTheme('light')">
                  <Sun class="w-8 h-8" />
                  <span class="text-sm font-medium">Light</span>
                </button>
                <button
                  class="flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all hover:bg-muted/50"
                  :class="theme === 'dark'
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent'
                    " @click="applyTheme('dark')">
                  <Moon class="w-8 h-8" />
                  <span class="text-sm font-medium">Dark</span>
                </button>
                <button
                  class="flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all hover:bg-muted/50"
                  :class="theme === 'system'
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent'
                    " @click="applyTheme('system')">
                  <Monitor class="w-8 h-8" />
                  <span class="text-sm font-medium">System</span>
                </button>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2">
              <Palette class="w-4 h-4 text-primary" />
              Accent Color
            </h3>
            <div class="p-5 rounded-xl border border-border bg-card/50">
              <div class="flex flex-wrap gap-4">
                <button v-for="color in accentColors" :key="color.name" :class="[
                  color.class,
                  'w-12 h-12 rounded-full transition-all hover:scale-110 flex items-center justify-center',
                  accentColor === color.name
                    ? 'ring-4 ring-offset-4 ring-offset-background ring-foreground'
                    : '',
                ]" :title="color.name" @click="applyAccentColor(color)">
                  <Check v-if="accentColor === color.name" class="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
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

            <div class="grid grid-cols-3 gap-4">
              <div
                class="p-5 rounded-xl border border-border bg-card/50 flex flex-col items-center justify-center text-center">
                <div class="text-3xl font-bold text-primary">
                  {{ modCount }}
                </div>
                <div class="text-sm text-muted-foreground mt-1">Total Mods</div>
              </div>
              <div
                class="p-5 rounded-xl border border-border bg-card/50 flex flex-col items-center justify-center text-center">
                <div class="text-3xl font-bold text-primary">
                  {{ modpackCount }}
                </div>
                <div class="text-sm text-muted-foreground mt-1">Modpacks</div>
              </div>
              <div
                class="p-5 rounded-xl border border-border bg-card/50 flex flex-col items-center justify-center text-center">
                <div class="text-3xl font-bold text-primary">
                  {{ totalSize }}
                </div>
                <div class="text-sm text-muted-foreground mt-1">Total Size</div>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2">
              <FolderOpen class="w-4 h-4 text-primary" />
              Storage Location
            </h3>
            <div class="p-5 rounded-xl border border-border bg-card/50">
              <div class="space-y-2">
                <label class="text-sm font-medium">Mod Library Path</label>
                <div class="flex gap-2">
                  <Input v-model="libraryPath" readonly class="flex-1 font-mono text-sm" />
                  <Button variant="outline" @click="openLibraryFolder">
                    <ExternalLink class="w-4 h-4 mr-2" />
                    Open
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <h3 class="text-lg font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle class="w-4 h-4" />
              Danger Zone
            </h3>
            <div class="p-5 rounded-xl border border-destructive/30 bg-destructive/5">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium text-destructive">Clear All Data</div>
                  <div class="text-sm text-muted-foreground">
                    Permanently delete all mods and modpacks. This cannot be
                    undone.
                  </div>
                </div>
                <Button variant="destructive" @click="clearAllData" :disabled="isClearingData">
                  <Trash2 class="w-4 h-4 mr-2" />
                  {{ isClearingData ? "Clearing..." : "Clear All Data" }}
                </Button>
              </div>
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
            <div class="rounded-xl border border-border bg-card/50 overflow-hidden">
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
          <div class="flex flex-col items-center justify-center py-12 text-center space-y-6">
            <div class="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mb-4">
              <span class="text-5xl font-bold text-primary">M</span>
            </div>

            <div>
              <h2 class="text-3xl font-bold tracking-tight">ModEx</h2>
              <p class="text-muted-foreground mt-2 text-lg">The modern Minecraft mod manager</p>
            </div>

            <div class="flex gap-4 mt-4">
              <div class="px-4 py-2 rounded-full bg-muted text-sm font-medium">
                v{{ appVersion }}
              </div>
              <div class="px-4 py-2 rounded-full bg-muted text-sm font-medium">
                Electron + Vue 3
              </div>
            </div>

            <div class="pt-8 text-sm text-muted-foreground">
              <p class="flex items-center justify-center gap-1">
                Made with
                <Heart class="w-4 h-4 text-red-500 fill-red-500" /> for the community
              </p>
              <p class="mt-2">© {{ new Date().getFullYear() }} ModEx Team</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
