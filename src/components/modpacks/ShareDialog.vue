<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "@/composables/useToast";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Icon from "@/components/ui/Icon.vue";
import Input from "@/components/ui/Input.vue";

const router = useRouter();

const props = defineProps<{
  open: boolean;
  modpackId?: string;
  modpackName?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "refresh"): void;
}>();

const toast = useToast();

// API Key state
const hasApiKey = ref(true);

type Tab = "export" | "import";
const activeTab = ref<Tab>("export");

// Export state
const shareCode = ref<string | null>(null);
const checksum = ref<string | null>(null);
const isExporting = ref(false);
const exportSuccess = ref(false);
const exportPath = ref<string | null>(null);
const copied = ref(false);

// Export options
const versionHistoryMode = ref<'full' | 'current'>('full');

// Import state
const isImporting = ref(false);
const importProgress = ref<{ current: number; total: number; modName: string } | null>(null);
const importResult = ref<{
  success: boolean;
  modpackId: string;
  code: string;
  isUpdate: boolean;
  changes?: {
    added: number;
    removed: number;
    unchanged: number;
    updated: number;
    downloaded: number;
    enabled: number;
    disabled: number;
    addedMods: string[];
    removedMods: string[];
    updatedMods: string[];
    downloadedMods: string[];
    enabledMods: string[];
    disabledMods: string[];
  };
} | null>(null);

// URL Import state
const urlImportMode = ref(false);
const importUrl = ref("");
const isImportingUrl = ref(false);
const urlImportError = ref<string | null>(null);

// Existing share info
const existingShareInfo = ref<{
  shareCode: string | null;
  lastSync: string | null;
} | null>(null);

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      // Check for API key
      hasApiKey.value = await window.api.curseforge.hasApiKey();

      // Reset state
      shareCode.value = null;
      checksum.value = null;
      exportSuccess.value = false;
      exportPath.value = null;
      importResult.value = null;
      copied.value = false;
      urlImportMode.value = false;
      importUrl.value = "";
      urlImportError.value = null;

      // Load existing share info if we have a modpack
      if (props.modpackId) {
        activeTab.value = "export";
        // We'll generate the code when user clicks export
        shareCode.value = null;
        checksum.value = null;
      } else {
        activeTab.value = "import";
      }
    }
  }
);

async function exportModex() {
  if (!props.modpackId) return;

  isExporting.value = true;
  exportSuccess.value = false;

  try {
    const result = await window.api.export.modex(props.modpackId, {
      versionHistoryMode: versionHistoryMode.value
    });
    if (result) {
      exportSuccess.value = true;
      exportPath.value = result.path;
      shareCode.value = result.code;
    }
  } catch (err) {
    console.error("Export failed:", err);
    toast.error("Export Failed", (err as Error).message);
  } finally {
    isExporting.value = false;
  }
}

// Conflict resolution state
const showConflictDialog = ref(false);
const pendingConflicts = ref<{
  conflicts: Array<{
    modName: string;
    existingVersion: string;
    newVersion: string;
    existingModId: string;
    modEntry: any;
    existingMod: any;
    resolution?: 'use_existing' | 'use_new';
  }>;
  partialData: any;
  manifest: any;
  modpackId: string;
} | null>(null);

async function importModex() {
  isImporting.value = true;
  importResult.value = null;
  importProgress.value = { current: 0, total: 0, modName: "" };

  // Listen for progress updates
  const progressHandler = (data: { current: number; total: number; modName: string }) => {
    importProgress.value = data;
  };
  const removeProgressListener = window.api.on("import:progress", progressHandler);

  try {
    const result = await window.api.import.modex();
    console.log('[Frontend] Import result:', result);
    if (result) {
      // Check for API key or other errors
      const errors = (result as any).errors;
      if (result.success === false && errors?.length > 0) {
        toast.error("Import Failed", errors[0]);
        removeProgressListener();
        isImporting.value = false;
        importProgress.value = null;
        return;
      }

      // Check if conflicts need resolution
      if (result.requiresResolution && result.conflicts) {
        console.log(`[Frontend] ${result.conflicts.length} conflicts detected, showing dialog`);
        // Show conflict resolution dialog
        pendingConflicts.value = {
          conflicts: result.conflicts.map(c => ({ ...c, resolution: 'use_existing' })),
          partialData: result.partialData,
          manifest: result.manifest,
          modpackId: result.partialData.modpackId || '',
        };
        showConflictDialog.value = true;
        isImporting.value = false;
        importProgress.value = null;
        removeProgressListener();
        return;
      }

      // Map the result to match our expected format
      importResult.value = {
        success: true,
        modpackId: result.modpackId,
        code: result.code,
        isUpdate: result.isUpdate,
        changes: result.changes,
      };

      // Show success toast
      if (result.isUpdate) {
        const parts: string[] = [];
        if (result.changes?.added) parts.push(`${result.changes.added} added`);
        if (result.changes?.removed) parts.push(`${result.changes.removed} removed`);
        if (result.changes?.updated) parts.push(`${result.changes.updated} updated`);
        if (result.changes?.downloaded) parts.push(`${result.changes.downloaded} downloaded`);

        toast.success(
          "Modpack Updated",
          parts.length > 0 ? parts.join(", ") : "Modpack synchronized"
        );
      } else {
        toast.success("Modpack Imported", "Successfully imported modpack");
      }

      emit("refresh");
    }
  } catch (err) {
    console.error("Import failed:", err);
    toast.error("Import Failed", (err as Error).message);
  } finally {
    removeProgressListener();
    isImporting.value = false;
    importProgress.value = null;
  }
}

async function importFromUrl() {
  if (!importUrl.value.trim()) {
    urlImportError.value = "Please enter a URL";
    return;
  }

  isImportingUrl.value = true;
  urlImportError.value = null;
  importProgress.value = { current: 0, total: 0, modName: "" };

  // Listen for progress updates
  const progressHandler = (data: { current: number; total: number; modName: string }) => {
    importProgress.value = data;
  };
  const removeProgressListener = window.api.on("import:progress", progressHandler);

  try {
    const result = await window.api.remote.importFromUrl(importUrl.value.trim());

    if (result.success) {
      if (result.alreadyExists) {
        toast.info(
          "Already Synced",
          result.message || "This modpack is already linked to this URL"
        );
      } else {
        toast.success(
          "Modpack Imported",
          `Imported "${result.modpackName}" with ${result.modsImported} mods`
        );
      }
      importUrl.value = "";
      urlImportMode.value = false;
      emit("refresh");
      emit("close");
    } else {
      urlImportError.value = result.error || "Import failed";
    }
  } catch (err) {
    console.error("URL Import failed:", err);
    urlImportError.value = (err as Error).message;
  } finally {
    removeProgressListener();
    isImportingUrl.value = false;
    importProgress.value = null;
  }
}

async function resolveConflicts() {
  if (!pendingConflicts.value) return;

  isImporting.value = true;

  try {
    const result = await window.api.import.resolveConflicts({
      modpackId: pendingConflicts.value.modpackId,
      conflicts: pendingConflicts.value.conflicts.map(c => ({
        modEntry: c.modEntry,
        existingMod: c.existingMod,
        resolution: c.resolution || 'use_existing',
      })),
      partialData: pendingConflicts.value.partialData,
      manifest: pendingConflicts.value.manifest,
    });

    if (result) {
      showConflictDialog.value = false;
      pendingConflicts.value = null;

      // Map the result
      importResult.value = {
        success: true,
        modpackId: result.modpackId,
        code: result.code,
        isUpdate: result.isUpdate,
        changes: result.changes,
      };

      // Show success toast
      if (result.isUpdate) {
        toast.success(
          "Modpack Updated",
          `${result.changes?.added || 0} mods added, ${result.changes?.removed || 0} removed`
        );
      } else {
        toast.success("Modpack Imported", "Successfully imported modpack");
      }

      emit("refresh");
    }
  } catch (err) {
    console.error("Conflict resolution failed:", err);
    toast.error("Resolution Failed", (err as Error).message);
  } finally {
    isImporting.value = false;
  }
}

function copyCode() {
  if (shareCode.value) {
    navigator.clipboard.writeText(shareCode.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  }
}

function goToSettings() {
  emit("close");
  router.push("/settings");
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
</script>

<template>
  <Dialog :open="open" title="MODEX Share" @close="$emit('close')">
    <div class="min-w-[400px] max-w-md mx-auto">
      <!-- Tabs -->
      <div class="flex border-b border-border mb-4 ">
        <button v-if="modpackId" class="flex-1 py-2 px-4 text-sm font-medium transition-colors border-b-2" :class="activeTab === 'export'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
          " @click="activeTab = 'export'">
          <Icon name="Upload" class="inline w-4 h-4 mr-1.5" />
          Export
        </button>
        <button class="flex-1 py-2 px-4 text-sm font-medium transition-colors border-b-2" :class="activeTab === 'import'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
          " @click="activeTab = 'import'">
          <Icon name="Download" class="inline w-4 h-4 mr-1.5" />
          Import
        </button>
      </div>

      <!-- Export Tab -->
      <div v-if="activeTab === 'export' && modpackId" class="space-y-4">
        <div class="p-4 rounded-lg bg-muted/50 border border-border">
          <div class="text-sm font-medium mb-1">{{ modpackName }}</div>
          <div class="text-xs text-muted-foreground">
            Share this modpack with others
          </div>
        </div>

        <!-- Share Code Preview -->
        <div v-if="shareCode" class="space-y-2">
          <label class="text-xs text-muted-foreground uppercase tracking-wide">Share Code</label>
          <div class="flex items-center gap-2">
            <div class="flex-1 px-4 py-3 bg-muted rounded-lg font-mono text-lg tracking-wider text-center">
              {{ shareCode }}
            </div>
            <Button variant="outline" size="sm" @click="copyCode">
              <Icon v-if="copied" name="Check" class="w-4 h-4 text-green-500" />
              <Icon v-else name="Copy" class="w-4 h-4" />
            </Button>
          </div>
        </div>

        <!-- Checksum -->
        <div v-if="checksum" class="text-xs text-muted-foreground">
          <span class="opacity-50">Checksum:</span>
          <span class="font-mono ml-1">{{ checksum }}</span>
        </div>

        <!-- Existing sync info -->
        <div v-if="existingShareInfo?.lastSync" class="text-xs text-muted-foreground">
          <span class="opacity-50">Last shared:</span>
          <span class="ml-1">{{ formatDate(existingShareInfo.lastSync) }}</span>
        </div>

        <!-- Version History Options -->
        <div class="space-y-2">
          <label class="text-xs text-muted-foreground uppercase tracking-wide">Version History</label>
          <div class="flex gap-2">
            <button @click="versionHistoryMode = 'full'"
              class="flex-1 px-3 py-2 text-sm rounded-lg border transition-all" :class="versionHistoryMode === 'full'
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/50'">
              <div class="font-medium">Full History</div>
              <div class="text-xs opacity-70">Export all versions</div>
            </button>
            <button @click="versionHistoryMode = 'current'"
              class="flex-1 px-3 py-2 text-sm rounded-lg border transition-all" :class="versionHistoryMode === 'current'
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/50'">
              <div class="font-medium">Current Only</div>
              <div class="text-xs opacity-70">Export current version</div>
            </button>
          </div>
        </div>

        <!-- Export Button -->
        <Button class="w-full" @click="exportModex" :disabled="isExporting">
          <Icon v-if="isExporting" name="RefreshCw" class="w-4 h-4 mr-2 animate-spin" />
          <Icon v-else name="Share2" class="w-4 h-4 mr-2" />
          {{ isExporting ? "Exporting..." : "Export as .modex" }}
        </Button>

        <!-- Export Success -->
        <div v-if="exportSuccess"
          class="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-sm">
          <div class="font-medium">✓ Exported successfully!</div>
          <div class="text-xs mt-1 opacity-70 truncate">{{ exportPath }}</div>
          <div class="text-xs mt-2">
            Share the <strong>.modex</strong> file and the code
            <strong>{{ shareCode }}</strong> with your friends.
          </div>
        </div>
      </div>

      <!-- Import Tab -->
      <div v-if="activeTab === 'import'" class="space-y-4">
        <!-- API Key Warning -->
        <div v-if="!hasApiKey" class="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div class="flex items-start gap-3">
            <Icon name="AlertTriangle" class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div class="flex-1">
              <div class="text-sm font-medium text-amber-600 dark:text-amber-400">
                CurseForge API Key Required
              </div>
              <p class="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
                Import functionality requires a CurseForge API key to fetch mod metadata.
                Please add your API key in Settings.
              </p>
              <button @click="goToSettings"
                class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 rounded-md transition-colors">
                <Icon name="Key" class="w-3.5 h-3.5" />
                Go to Settings
              </button>
            </div>
          </div>
        </div>

        <!-- Toggle between file import and URL import -->
        <div class="flex gap-2">
          <Button variant="outline" class="flex-1" :class="!urlImportMode ? 'ring-2 ring-primary' : ''"
            @click="urlImportMode = false" :disabled="!hasApiKey">
            <Icon name="Download" class="w-4 h-4 mr-2" />
            From File
          </Button>
          <Button variant="outline" class="flex-1" :class="urlImportMode ? 'ring-2 ring-primary' : ''"
            @click="urlImportMode = true" :disabled="!hasApiKey">
            <Icon name="Link" class="w-4 h-4 mr-2" />
            From URL
          </Button>
        </div>

        <!-- File Import Section -->
        <template v-if="!urlImportMode && hasApiKey">
          <div class="p-4 rounded-lg bg-muted/50 border border-border">
            <div class="text-sm font-medium mb-1">Import from File</div>
            <div class="text-xs text-muted-foreground">
              Import a .modex file shared by someone else
            </div>
          </div>

          <!-- Import Button -->
          <Button class="w-full" @click="importModex" :disabled="isImporting">
            <Icon v-if="isImporting" name="RefreshCw" class="w-4 h-4 mr-2 animate-spin" />
            <Icon v-else name="Download" class="w-4 h-4 mr-2" />
            {{ isImporting ? "Importing..." : "Select .modex file" }}
          </Button>
        </template>

        <!-- URL Import Section -->
        <template v-if="urlImportMode && hasApiKey">
          <div class="p-4 rounded-lg bg-muted/50 border border-border">
            <div class="text-sm font-medium mb-1">Import from URL</div>
            <div class="text-xs text-muted-foreground">
              Paste a Gist raw URL or any URL pointing to a MODEX manifest
            </div>
          </div>

          <div class="space-y-2">
            <Input v-model="importUrl" placeholder="https://gist.githubusercontent.com/..." :disabled="isImportingUrl"
              @keyup.enter="importFromUrl" />
            <p v-if="urlImportError" class="text-xs text-red-500">{{ urlImportError }}</p>
          </div>

          <Button class="w-full" @click="importFromUrl" :disabled="isImportingUrl || !importUrl.trim()">
            <Icon v-if="isImportingUrl" name="RefreshCw" class="w-4 h-4 mr-2 animate-spin" />
            <Icon v-else name="Link" class="w-4 h-4 mr-2" />
            {{ isImportingUrl ? "Importing..." : "Import from URL" }}
          </Button>
        </template>

        <!-- Import Progress (shared) -->
        <div v-if="(isImporting || isImportingUrl) && importProgress && importProgress.total > 0"
          class="p-4 rounded-lg bg-muted/50 border border-border space-y-3">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Processing mods...</span>
            <span class="font-mono text-primary">{{ importProgress.current }}/{{ importProgress.total }}</span>
          </div>

          <!-- Progress bar -->
          <div class="h-2 bg-muted rounded-full overflow-hidden">
            <div class="h-full bg-primary transition-all duration-300 ease-out rounded-full"
              :style="{ width: `${(importProgress.current / importProgress.total) * 100}%` }" />
          </div>

          <!-- Current mod name -->
          <div class="text-xs text-muted-foreground truncate">
            {{ importProgress.modName }}
          </div>
        </div>

        <!-- Import Result -->
        <div v-if="importResult" class="p-4 rounded-lg border text-sm space-y-2" :class="importResult.isUpdate
          ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
          : 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
          ">
          <div class="font-medium">
            {{
              importResult.isUpdate
                ? "↻ Modpack Updated!"
                : "✓ Modpack Imported!"
            }}
          </div>

          <div class="text-xs opacity-70">
            Code: <span class="font-mono">{{ importResult.code }}</span>
          </div>

          <div v-if="importResult.changes" class="space-y-2 text-xs mt-3">
            <!-- Summary -->
            <div class="flex gap-4 font-medium flex-wrap">
              <span v-if="importResult.changes.added > 0" class="text-green-500">+{{ importResult.changes.added }}
                added</span>
              <span v-if="importResult.changes.removed > 0" class="text-red-500">-{{ importResult.changes.removed }}
                removed</span>
              <span v-if="importResult.changes.updated > 0" class="text-blue-500">↻{{ importResult.changes.updated }}
                updated</span>
              <span v-if="importResult.changes.downloaded > 0" class="text-purple-500">↓{{
                importResult.changes.downloaded }} downloaded</span>
              <span v-if="importResult.changes.enabled > 0" class="text-emerald-500">✓{{ importResult.changes.enabled }}
                enabled</span>
              <span v-if="importResult.changes.disabled > 0" class="text-amber-500">✕{{ importResult.changes.disabled }}
                disabled</span>
              <span class="text-muted-foreground">{{ importResult.changes.unchanged }} unchanged</span>
            </div>

            <!-- Added Mods -->
            <div v-if="importResult.changes.added > 0" class="space-y-0.5">
              <div class="text-green-500 font-medium">Added to Pack:</div>
              <div v-for="(mod, idx) in importResult.changes.addedMods.slice(0, 5)" :key="idx"
                class="pl-3 text-green-500/80">
                + {{ mod }}
              </div>
              <div v-if="importResult.changes.addedMods.length > 5" class="pl-3 text-green-500/50">
                ... and {{ importResult.changes.addedMods.length - 5 }} more
              </div>
            </div>

            <!-- Removed Mods -->
            <div v-if="importResult.changes.removed > 0" class="space-y-0.5">
              <div class="text-red-500 font-medium">Removed from Pack:</div>
              <div v-for="(mod, idx) in importResult.changes.removedMods.slice(0, 5)" :key="idx"
                class="pl-3 text-red-500/80">
                - {{ mod }}
              </div>
              <div v-if="importResult.changes.removedMods.length > 5" class="pl-3 text-red-500/50">
                ... and {{ importResult.changes.removedMods.length - 5 }} more
              </div>
            </div>

            <!-- Enabled Mods -->
            <div v-if="importResult.changes.enabled > 0" class="space-y-0.5">
              <div class="text-emerald-500 font-medium">Re-enabled:</div>
              <div v-for="(mod, idx) in importResult.changes.enabledMods.slice(0, 5)" :key="idx"
                class="pl-3 text-emerald-500/80">
                ✓ {{ mod }}
              </div>
              <div v-if="importResult.changes.enabledMods.length > 5" class="pl-3 text-emerald-500/50">
                ... and {{ importResult.changes.enabledMods.length - 5 }} more
              </div>
            </div>

            <!-- Disabled Mods -->
            <div v-if="importResult.changes.disabled > 0" class="space-y-0.5">
              <div class="text-amber-500 font-medium">Disabled:</div>
              <div v-for="(mod, idx) in importResult.changes.disabledMods.slice(0, 5)" :key="idx"
                class="pl-3 text-amber-500/80">
                ✕ {{ mod }}
              </div>
              <div v-if="importResult.changes.disabledMods.length > 5" class="pl-3 text-amber-500/50">
                ... and {{ importResult.changes.disabledMods.length - 5 }} more
              </div>
            </div>

            <!-- Updated Mods -->
            <div v-if="importResult.changes.updated > 0" class="space-y-0.5">
              <div class="text-blue-500 font-medium">Updated:</div>
              <div v-for="(mod, idx) in importResult.changes.updatedMods.slice(0, 5)" :key="idx"
                class="pl-3 text-blue-500/80">
                ↻ {{ mod }}
              </div>
              <div v-if="importResult.changes.updatedMods.length > 5" class="pl-3 text-blue-500/50">
                ... and {{ importResult.changes.updatedMods.length - 5 }} more
              </div>
            </div>

            <!-- Downloaded Mods -->
            <div v-if="importResult.changes.downloaded > 0" class="space-y-0.5">
              <div class="text-purple-500 font-medium">Downloaded to Library:</div>
              <div v-for="(mod, idx) in importResult.changes.downloadedMods.slice(0, 5)" :key="idx"
                class="pl-3 text-purple-500/80">
                ↓ {{ mod }}
              </div>
              <div v-if="importResult.changes.downloadedMods.length > 5" class="pl-3 text-purple-500/50">
                ... and {{ importResult.changes.downloadedMods.length - 5 }} more
              </div>
            </div>

            <!-- Unchanged (show count only) -->
            <div v-if="importResult.changes.unchanged > 0" class="text-muted-foreground/70">
              {{ importResult.changes.unchanged }} mods unchanged
            </div>
          </div>
        </div>

        <!-- How it works -->
        <div class="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
          <div class="font-medium mb-2">How it works:</div>
          <template v-if="!urlImportMode">
            <div>1. Get a <strong>.modex</strong> file from a friend</div>
            <div>2. Click "Select .modex file" to import</div>
            <div>3. If you already have this modpack, it will update</div>
          </template>
          <template v-else>
            <div>1. Get a Gist raw URL or MODEX manifest URL</div>
            <div>2. Paste the URL and click "Import from URL"</div>
            <div>3. The modpack will be imported with remote sync enabled</div>
          </template>
        </div>
      </div>
    </div>

    <template #footer>
      <Button variant="outline" @click="$emit('close')">Close</Button>
    </template>
  </Dialog>

  <!-- Conflict Resolution Dialog -->
  <Dialog :open="showConflictDialog" @close="showConflictDialog = false">
    <template #header>
      <h2 class="text-xl font-bold">Version Conflicts Detected</h2>
    </template>

    <div class="space-y-4">
      <p class="text-sm text-muted-foreground">
        Some mods already exist in your library with different versions. Choose which version to use:
      </p>

      <div v-if="pendingConflicts" class="space-y-3 max-h-96 overflow-y-auto">
        <div v-for="(conflict, idx) in pendingConflicts.conflicts" :key="idx"
          class="p-4 rounded-lg border bg-card space-y-3">
          <div class="font-semibold">{{ conflict.modName }}</div>

          <!-- Use Existing Version -->
          <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all" :class="conflict.resolution === 'use_existing'
            ? 'bg-primary/10 border-primary'
            : 'bg-muted/50 border-border hover:bg-muted'
            ">
            <input type="radio" :name="`conflict-${idx}`" value="use_existing" v-model="conflict.resolution"
              class="mt-1" />
            <div class="flex-1">
              <div class="font-medium text-sm">Keep existing version</div>
              <div class="text-xs text-muted-foreground mt-1">
                Version: {{ conflict.existingVersion }}
              </div>
              <div class="text-xs text-muted-foreground">
                Already downloaded in your library
              </div>
            </div>
          </label>

          <!-- Use New Version -->
          <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all" :class="conflict.resolution === 'use_new'
            ? 'bg-primary/10 border-primary'
            : 'bg-muted/50 border-border hover:bg-muted'
            ">
            <input type="radio" :name="`conflict-${idx}`" value="use_new" v-model="conflict.resolution" class="mt-1" />
            <div class="flex-1">
              <div class="font-medium text-sm">Download new version</div>
              <div class="text-xs text-muted-foreground mt-1">
                Version: {{ conflict.newVersion }}
              </div>
              <div class="text-xs text-muted-foreground">
                From the imported modpack
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-2">
        <Button variant="outline" @click="showConflictDialog = false; pendingConflicts = null">
          Cancel
        </Button>
        <Button @click="resolveConflicts" :disabled="isImporting">
          <Icon v-if="isImporting" name="RefreshCw" class="w-4 h-4 mr-2 animate-spin" />
          {{ isImporting ? "Applying..." : "Apply Choices" }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>
