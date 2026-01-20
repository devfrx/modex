<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Icon from "@/components/ui/Icon.vue";
import { useMinecraft } from "@/composables/useMinecraft";
import type { MinecraftInstallation } from "@/types";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import { createLogger } from "@/utils/logger";

const log = createLogger("SyncModpackDialog");

const props = defineProps<{
  open: boolean;
  modpackId: string;
  modpackName: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "synced", result: { success: boolean; synced: number }): void;
}>();

const {
  installations,
  isLoading,
  isSyncing,
  syncProgress,
  defaultInstallation,
  hasInstallations,
  scanInstallations,
  syncModpack,
  launchGame,
  getTypeName
} = useMinecraft();

// State
const selectedInstallation = ref<string | null>(null);
const clearExisting = ref(false);
const createBackup = ref(true);
const syncResult = ref<{
  success: boolean;
  synced: number;
  skipped: number;
  errors: string[];
  syncedMods: string[];
} | null>(null);
const showInstallationDropdown = ref(false);

// Set default selection when installations change
watch([() => props.open, () => installations.value], () => {
  if (props.open && installations.value.length > 0 && !selectedInstallation.value) {
    selectedInstallation.value = defaultInstallation.value?.id || installations.value[0]?.id || null;
  }
}, { immediate: true });

// Reset state when dialog opens
watch(() => props.open, (open) => {
  if (open) {
    log.debug('Sync dialog opened', { modpackId: props.modpackId, modpackName: props.modpackName });
    syncResult.value = null;
    clearExisting.value = false;
    createBackup.value = true;
  }
});

const selectedInstallationData = computed(() => {
  if (!selectedInstallation.value) return null;
  return installations.value.find(i => i.id === selectedInstallation.value);
});

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

async function handleSync() {
  if (!selectedInstallation.value) return;

  log.info('Starting modpack sync', {
    modpackId: props.modpackId,
    installationId: selectedInstallation.value,
    clearExisting: clearExisting.value,
    createBackup: createBackup.value
  });
  syncResult.value = null;

  const result = await syncModpack(
    selectedInstallation.value,
    props.modpackId,
    { clearExisting: clearExisting.value, createBackup: createBackup.value }
  );

  log.info('Sync completed', {
    success: result.success,
    synced: result.synced,
    skipped: result.skipped,
    errors: result.errors?.length || 0
  });
  syncResult.value = result;
  emit("synced", { success: result.success, synced: result.synced });
}

async function handleLaunch() {
  if (!selectedInstallation.value) return;
  log.info('Launching game after sync', { installationId: selectedInstallation.value });
  await launchGame(selectedInstallation.value);
  emit("close");
}
</script>

<template>
  <Dialog :open="open" @close="$emit('close')" size="lg">
    <template #title>
      <div class="flex items-center gap-2">
        <Icon name="FolderSync" class="w-5 h-5 text-primary" />
        Sync to Minecraft
      </div>
    </template>

    <div class="space-y-4">
      <!-- Modpack Info -->
      <div class="p-3 rounded-lg bg-muted/50 border border-border">
        <p class="text-sm text-muted-foreground">Syncing modpack:</p>
        <p class="font-medium text-foreground">{{ modpackName }}</p>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center py-8">
        <Icon name="Loader2" class="w-8 h-8 animate-spin text-primary" />
      </div>

      <!-- No Installations -->
      <div v-else-if="!hasInstallations" class="text-center py-8">
        <Icon name="HardDrive" class="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
        <p class="text-muted-foreground mb-4">No Minecraft installations found</p>
        <Button variant="secondary" @click="scanInstallations">
          Scan for Installations
        </Button>
      </div>

      <!-- Sync Form -->
      <template v-else>
        <!-- Installation Selector -->
        <div>
          <label class="block text-sm font-medium text-foreground mb-2">
            Target Installation
          </label>

          <div class="relative">
            <button
              class="w-full p-3 rounded-lg border border-border bg-card text-left flex items-center gap-3 hover:border-primary/50 transition-colors"
              @click="showInstallationDropdown = !showInstallationDropdown">
              <template v-if="selectedInstallationData">
                <span class="text-lg">{{ getTypeIcon(selectedInstallationData.type) }}</span>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-foreground truncate">{{ selectedInstallationData.name }}</p>
                  <p class="text-xs text-muted-foreground truncate">{{ selectedInstallationData.modsPath }}</p>
                </div>
              </template>
              <template v-else>
                <span class="text-muted-foreground">Select an installation...</span>
              </template>
              <Icon name="ChevronDown" class="w-4 h-4 text-muted-foreground shrink-0" />
            </button>

            <!-- Dropdown -->
            <div v-if="showInstallationDropdown"
              class="absolute top-full left-0 right-0 mt-1 py-1 rounded-lg border border-border bg-popover shadow-xl z-50 max-h-64 overflow-auto">
              <button v-for="inst in installations" :key="inst.id"
                class="w-full p-3 text-left flex items-center gap-3 hover:bg-muted transition-colors"
                :class="inst.id === selectedInstallation && 'bg-primary/10'"
                @click="selectedInstallation = inst.id; showInstallationDropdown = false">
                <span class="text-lg">{{ getTypeIcon(inst.type) }}</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="font-medium text-foreground truncate">{{ inst.name }}</p>
                    <span v-if="inst.isDefault" class="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                      Default
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground truncate">{{ inst.modsPath }}</p>
                </div>
                <Icon v-if="inst.id === selectedInstallation" name="CheckCircle"
                  class="w-4 h-4 text-primary shrink-0" />
              </button>
            </div>
          </div>
        </div>

        <!-- Options -->
        <div class="space-y-3">
          <label
            class="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 cursor-pointer transition-colors">
            <input v-model="createBackup" type="checkbox"
              class="w-4 h-4 rounded border-border bg-muted accent-primary" />
            <div class="flex-1">
              <p class="text-sm font-medium text-foreground">Create backup</p>
              <p class="text-xs text-muted-foreground">Backup existing mods folder before syncing</p>
            </div>
          </label>

          <label
            class="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 cursor-pointer transition-colors">
            <input v-model="clearExisting" type="checkbox"
              class="w-4 h-4 rounded border-border bg-muted accent-primary" />
            <div class="flex-1">
              <p class="text-sm font-medium text-foreground flex items-center gap-2">
                Clear existing mods
                <Icon name="AlertTriangle" class="w-3.5 h-3.5 text-orange-500" />
              </p>
              <p class="text-xs text-muted-foreground">Remove all existing mods before syncing</p>
            </div>
          </label>
        </div>

        <!-- Progress -->
        <div v-if="isSyncing" class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Syncing...</span>
            <span class="text-foreground">{{ syncProgress.current }} / {{ syncProgress.total }}</span>
          </div>
          <div class="w-full bg-muted rounded-full h-2">
            <div class="h-2 rounded-full bg-primary transition-all" :style="{ width: `${syncProgress.percentage}%` }">
            </div>
          </div>
          <p class="text-xs text-muted-foreground truncate">
            {{ syncProgress.modName }}
          </p>
        </div>

        <!-- Result -->
        <div v-if="syncResult" class="p-4 rounded-lg border"
          :class="syncResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'">
          <div class="flex items-center gap-2 mb-2">
            <Icon v-if="syncResult.success" name="CheckCircle" class="w-5 h-5 text-green-500" />
            <Icon v-else name="XCircle" class="w-5 h-5 text-red-500" />
            <span class="font-medium" :class="syncResult.success ? 'text-green-400' : 'text-red-400'">
              {{ syncResult.success ? 'Sync Complete!' : 'Sync Failed' }}
            </span>
          </div>

          <div class="text-sm space-y-1">
            <p class="text-muted-foreground">
              {{ syncResult.synced }} mods synced
              <span v-if="syncResult.skipped > 0">, {{ syncResult.skipped }} skipped</span>
            </p>

            <div v-if="syncResult.errors.length > 0" class="mt-2">
              <p class="text-red-400 text-xs font-medium mb-1">Errors:</p>
              <ul class="text-xs text-red-300/80 space-y-0.5">
                <li v-for="(err, i) in syncResult.errors.slice(0, 5)" :key="i">• {{ err }}</li>
                <li v-if="syncResult.errors.length > 5">... and {{ syncResult.errors.length - 5 }} more</li>
              </ul>
            </div>
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <Button variant="ghost" @click="$emit('close')">
        {{ syncResult?.success ? 'Done' : 'Cancel' }}
      </Button>

      <template v-if="!syncResult?.success">
        <Button variant="default" :disabled="!selectedInstallation || isSyncing" @click="handleSync">
          <Icon v-if="isSyncing" name="Loader2" class="w-4 h-4 mr-2 animate-spin" />
          <Icon v-else name="Upload" class="w-4 h-4 mr-2" />
          Sync Modpack
        </Button>
      </template>

      <template v-else>
        <Button variant="default" @click="handleLaunch">
          <Icon name="Play" class="w-4 h-4 mr-2" />
          Launch Minecraft
        </Button>
      </template>
    </template>
  </Dialog>
</template>
