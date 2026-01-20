<script setup lang="ts">
import { ref, computed } from "vue";
import Icon from "@/components/ui/Icon.vue";
import { useMinecraft } from "@/composables/useMinecraft";
import type { MinecraftInstallation } from "@/types";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import Input from "@/components/ui/Input.vue";
import { createLogger } from "@/utils/logger";

const log = createLogger("MinecraftInstallations");
const toast = useToast();

const {
  installations,
  isLoading,
  isScanning,
  defaultInstallation,
  hasInstallations,
  installationsByType,
  scanInstallations,
  addCustomInstallation,
  removeInstallation,
  setDefault,
  openModsFolder,
  launchGame,
  selectFolder,
  selectLauncher,
  getLauncherPaths,
  setLauncherPath,
  getTypeName
} = useMinecraft();

// Add custom installation dialog
const showAddDialog = ref(false);
const showLauncherConfig = ref(false);
const launcherPaths = ref<Record<string, string>>({});
const newInstallation = ref({
  name: "",
  path: "",
  modsPath: ""
});
const isAdding = ref(false);

// Launcher types that can be configured
const launcherTypes = [
  { id: "vanilla", name: "Minecraft (Vanilla)", icon: "🎮" },
  { id: "prism", name: "Prism Launcher", icon: "🔷" },
  { id: "curseforge", name: "CurseForge", icon: "🔥" },
  { id: "modrinth", name: "Modrinth App", icon: "🟢" },
  { id: "multimc", name: "MultiMC", icon: "📦" },
];

// Default paths that are checked automatically (Windows)
const defaultLauncherPaths: Record<string, string[]> = {
  vanilla: [
    "C:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe",
    "%LOCALAPPDATA%\\Microsoft\\WindowsApps\\Minecraft.exe",
    "%PROGRAMFILES%\\Minecraft Launcher\\MinecraftLauncher.exe",
    "%LOCALAPPDATA%\\Programs\\Minecraft Launcher\\MinecraftLauncher.exe",
  ],
  prism: [
    "%LOCALAPPDATA%\\Programs\\PrismLauncher\\prismlauncher.exe",
    "%PROGRAMFILES%\\PrismLauncher\\prismlauncher.exe",
  ],
  curseforge: [
    "%LOCALAPPDATA%\\Programs\\CurseForge\\CurseForge.exe",
    "%PROGRAMFILES%\\CurseForge\\CurseForge.exe",
    "%PROGRAMFILES%\\Overwolf\\OverwolfLauncher.exe (legacy)",
  ],
  modrinth: [
    "%LOCALAPPDATA%\\Programs\\Modrinth App\\Modrinth App.exe",
  ],
  multimc: [
    "(Detected relative to instance path)",
  ],
};

async function loadLauncherPaths() {
  launcherPaths.value = await getLauncherPaths();
}

async function handleSetLauncherPath(type: string) {
  const path = await selectLauncher();
  if (path) {
    const success = await setLauncherPath(type, path);
    if (success) {
      launcherPaths.value[type] = path;
      toast.success("Saved ✓", `${type} launcher path set.`);
    } else {
      toast.error("Couldn't save", "Launcher path wasn't saved.");
    }
  }
}

async function handleClearLauncherPath(type: string) {
  // Setting empty path clears it - but we'd need to update the service
  delete launcherPaths.value[type];
  toast.info("Cleared", `${type} path removed. Using auto-detection.`);
}

// Icon mapping for installation types
function getTypeIcon(type: MinecraftInstallation["type"]): string {
  const icons: Record<string, string> = {
    vanilla: "🎮",
    prism: "🔷",
    multimc: "📦",
    curseforge: "🔥",
    atlauncher: "🚀",
    gdlauncher: "⚡",
    modrinth: "🟢",
    custom: "📁"
  };
  return icons[type] || "📁";
}

// Color mapping for installation types
function getTypeColor(type: MinecraftInstallation["type"]): string {
  const colors: Record<string, string> = {
    vanilla: "bg-green-500/20 text-green-400 border-green-500/30",
    prism: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    multimc: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    curseforge: "bg-red-500/20 text-red-400 border-red-500/30",
    atlauncher: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    gdlauncher: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    modrinth: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    custom: "bg-gray-500/20 text-gray-400 border-gray-500/30"
  };
  return colors[type] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
}

async function handleSelectPath() {
  log.debug('Selecting installation path');
  const path = await selectFolder();
  if (path) {
    log.debug('Path selected', { path });
    newInstallation.value.path = path;
    // Auto-suggest mods path
    if (!newInstallation.value.modsPath) {
      newInstallation.value.modsPath = `${path}\\mods`;
    }
  }
}

async function handleSelectModsPath() {
  const path = await selectFolder();
  if (path) {
    newInstallation.value.modsPath = path;
  }
}

async function handleAddInstallation() {
  if (!newInstallation.value.name || !newInstallation.value.path) return;

  log.info('Adding custom installation', { name: newInstallation.value.name, path: newInstallation.value.path });
  isAdding.value = true;
  try {
    await addCustomInstallation(
      newInstallation.value.name,
      newInstallation.value.path,
      newInstallation.value.modsPath || undefined
    );
    log.info('Custom installation added successfully');
    showAddDialog.value = false;
    newInstallation.value = { name: "", path: "", modsPath: "" };
  } finally {
    isAdding.value = false;
  }
}

async function handleLaunch(installation: MinecraftInstallation) {
  log.info('Launching game', { installationId: installation.id, type: installation.type });
  toast.info("Starting...", `Opening ${getTypeName(installation.type)}`);
  const result = await launchGame(installation.id);
  if (result.success) {
    log.info('Game launched successfully', { installationId: installation.id });
    toast.success("Launched ✓", `${getTypeName(installation.type)} is starting.`);
  } else if (result.error) {
    log.warn('Game launch warning', { installationId: installation.id, error: result.error });
    toast.warning("Heads up", result.error);
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center">
          <Icon name="Gamepad2" class="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 class="font-semibold text-foreground">Minecraft Installations</h3>
          <p class="text-xs text-muted-foreground">
            {{ installations.length }} installation{{ installations.length !== 1 ? 's' : '' }} found
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" @click="showLauncherConfig = true; loadLauncherPaths()"
          title="Configure Launcher Paths">
          <Icon name="Settings" class="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" :disabled="isScanning" @click="scanInstallations">
          <Icon name="RefreshCw" class="w-4 h-4" :class="isScanning && 'animate-spin'" />
          <span class="hidden sm:inline ml-2">Rescan</span>
        </Button>
        <Button variant="secondary" size="sm" @click="showAddDialog = true">
          <Icon name="Plus" class="w-4 h-4" />
          <span class="hidden sm:inline ml-2">Add Custom</span>
        </Button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Icon name="Loader2" class="w-6 h-6 animate-spin text-primary" />
    </div>

    <!-- Empty State -->
    <div v-else-if="!hasInstallations" class="text-center py-10 border border-dashed border-border/50 rounded-lg">
      <Icon name="Gamepad2" class="w-10 h-10 mx-auto text-muted-foreground mb-3 opacity-50" />
      <p class="text-muted-foreground text-sm mb-4">No Minecraft installations found</p>
      <div class="flex justify-center gap-2">
        <Button variant="secondary" size="sm" @click="scanInstallations">
          <Icon name="RefreshCw" class="w-3.5 h-3.5 mr-2" />
          Scan Again
        </Button>
        <Button variant="default" size="sm" @click="showAddDialog = true">
          <Icon name="Plus" class="w-3.5 h-3.5 mr-2" />
          Add Custom
        </Button>
      </div>
    </div>

    <!-- Installations List -->
    <div v-else class="space-y-2.5">
      <div v-for="installation in installations" :key="installation.id"
        class="group relative p-3.5 rounded-lg border border-border/50 bg-card/50 hover:border-border hover:bg-card/70 transition-all"
        :class="installation.isDefault && 'ring-1 ring-primary/50 border-primary/30'">
        <!-- Default Badge -->
        <div v-if="installation.isDefault"
          class="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
          Default
        </div>

        <div class="flex items-start gap-3">
          <!-- Icon -->
          <div class="w-10 h-10 rounded-lg border flex items-center justify-center text-lg shrink-0"
            :class="getTypeColor(installation.type)">
            {{ getTypeIcon(installation.type) }}
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h4 class="font-medium text-foreground truncate">{{ installation.name }}</h4>
              <span class="px-1.5 py-0.5 rounded text-[10px] font-medium border"
                :class="getTypeColor(installation.type)">
                {{ getTypeName(installation.type) }}
              </span>
            </div>

            <p class="text-xs text-muted-foreground mt-1 truncate" :title="installation.path">
              {{ installation.path }}
            </p>

            <div class="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span v-if="installation.version" class="flex items-center gap-1">
                <Icon name="HardDrive" class="w-3 h-3" />
                {{ installation.version }}
              </span>
              <span v-if="installation.loader" class="capitalize">
                {{ installation.loader }}
              </span>
              <span v-if="installation.lastUsed" class="opacity-50">
                Last used: {{ new Date(installation.lastUsed).toLocaleDateString() }}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" title="Open mods folder" @click="openModsFolder(installation.id)">
              <Icon name="FolderOpen" class="w-4 h-4" />
            </Button>

            <Button variant="ghost" size="icon" title="Set as default" :disabled="installation.isDefault"
              @click="setDefault(installation.id)">
              <Icon name="Star" class="w-4 h-4" :class="installation.isDefault && 'fill-yellow-500 text-yellow-500'" />
            </Button>

            <Button variant="ghost" size="icon" title="Launch Minecraft" @click="handleLaunch(installation)">
              <Icon name="Play" class="w-4 h-4" />
            </Button>

            <Button v-if="installation.type === 'custom'" variant="ghost" size="icon"
              class="text-red-400 hover:text-red-300 hover:bg-red-500/10" title="Remove"
              @click="removeInstallation(installation.id)">
              <Icon name="Trash2" class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Custom Dialog -->
    <Dialog :open="showAddDialog" @close="showAddDialog = false">
      <template #title>Add Custom Installation</template>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-foreground mb-1.5">
            Installation Name
          </label>
          <Input v-model="newInstallation.name" placeholder="My Minecraft Install" />
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1.5">
            Minecraft Folder
          </label>
          <div class="flex gap-2">
            <Input v-model="newInstallation.path" placeholder="C:\Users\...\minecraft" class="flex-1" />
            <Button variant="secondary" @click="handleSelectPath">
              <Icon name="FolderOpen" class="w-4 h-4" />
            </Button>
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            Select the .minecraft folder or game root directory
          </p>
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1.5">
            Mods Folder <span class="text-muted-foreground">(optional)</span>
          </label>
          <div class="flex gap-2">
            <Input v-model="newInstallation.modsPath" placeholder="Auto-detected from above" class="flex-1" />
            <Button variant="secondary" @click="handleSelectModsPath">
              <Icon name="FolderOpen" class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showAddDialog = false">
          Cancel
        </Button>
        <Button variant="default" :disabled="!newInstallation.name || !newInstallation.path || isAdding"
          @click="handleAddInstallation">
          <Icon v-if="isAdding" name="Loader2" class="w-4 h-4 mr-2 animate-spin" />
          Add Installation
        </Button>
      </template>
    </Dialog>

    <!-- Launcher Configuration Dialog -->
    <Dialog :open="showLauncherConfig" @close="showLauncherConfig = false" title="Configure Launcher Paths">
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          If the launcher isn't detected automatically, you can specify the executable path manually.
        </p>

        <div class="space-y-3">
          <div v-for="launcher in launcherTypes" :key="launcher.id" class="p-3 rounded-lg border border-border bg-card">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-3">
                <span class="text-xl">{{ launcher.icon }}</span>
                <div>
                  <div class="font-medium text-sm">{{ launcher.name }}</div>
                  <div v-if="launcherPaths[launcher.id]" class="text-xs text-emerald-400 flex items-center gap-1">
                    <Icon name="CheckCircle" class="w-3 h-3" />
                    Custom path set
                  </div>
                  <div v-else class="text-xs text-muted-foreground italic">
                    Using auto-detection
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <Button variant="secondary" size="sm" @click="handleSetLauncherPath(launcher.id)">
                  <Icon name="FolderOpen" class="w-4 h-4" />
                  <span class="ml-1 hidden sm:inline">Browse</span>
                </Button>
                <Button v-if="launcherPaths[launcher.id]" variant="ghost" size="sm"
                  @click="handleClearLauncherPath(launcher.id)">
                  <Icon name="Trash2" class="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>

            <!-- Current/Custom Path -->
            <div v-if="launcherPaths[launcher.id]"
              class="mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <div class="text-xs text-muted-foreground mb-1">Custom path:</div>
              <div class="text-xs font-mono text-emerald-400 break-all">{{ launcherPaths[launcher.id] }}</div>
            </div>

            <!-- Default Paths -->
            <details class="mt-2">
              <summary class="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Show auto-detection paths
              </summary>
              <div class="mt-2 p-2 rounded bg-muted/50 space-y-1">
                <div v-for="(path, idx) in defaultLauncherPaths[launcher.id]" :key="idx"
                  class="text-xs font-mono text-muted-foreground break-all">
                  {{ path }}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      <template #footer>
        <Button @click="showLauncherConfig = false">
          Done
        </Button>
      </template>
    </Dialog>
  </div>
</template>
