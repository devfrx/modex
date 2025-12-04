<script setup lang="ts">
import { ref, watch, computed } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import { Share2, Download, Upload, Copy, Check, RefreshCw } from "lucide-vue-next";

const props = defineProps<{
  open: boolean;
  modpackId?: string;
  modpackName?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "refresh"): void;
}>();

type Tab = "export" | "import";
const activeTab = ref<Tab>("export");

// Export state
const shareCode = ref<string | null>(null);
const checksum = ref<string | null>(null);
const isExporting = ref(false);
const exportSuccess = ref(false);
const exportPath = ref<string | null>(null);
const copied = ref(false);

// Import state
const isImporting = ref(false);
const importResult = ref<{
  success: boolean;
  modpackId: string;
  code: string;
  isUpdate: boolean;
  changes?: { added: number; removed: number; unchanged: number };
} | null>(null);

// Existing share info
const existingShareInfo = ref<{ shareCode: string | null; lastSync: string | null } | null>(null);

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    // Reset state
    shareCode.value = null;
    checksum.value = null;
    exportSuccess.value = false;
    exportPath.value = null;
    importResult.value = null;
    copied.value = false;
    
    // Load existing share info if we have a modpack
    if (props.modpackId) {
      activeTab.value = "export";
      try {
        existingShareInfo.value = await window.api.share.getInfo(props.modpackId);
        const preview = await window.api.share.generateCode(props.modpackId);
        shareCode.value = preview.code;
        checksum.value = preview.checksum;
      } catch (err) {
        console.error("Failed to load share info:", err);
      }
    } else {
      activeTab.value = "import";
    }
  }
});

async function exportModex() {
  if (!props.modpackId) return;
  
  isExporting.value = true;
  exportSuccess.value = false;
  
  try {
    const result = await window.api.share.exportModex(props.modpackId);
    if (result) {
      exportSuccess.value = true;
      exportPath.value = result.path;
      shareCode.value = result.code;
    }
  } catch (err) {
    console.error("Export failed:", err);
    alert("Export failed: " + (err as Error).message);
  } finally {
    isExporting.value = false;
  }
}

async function importModex() {
  isImporting.value = true;
  importResult.value = null;
  
  try {
    const result = await window.api.share.importModex();
    if (result) {
      importResult.value = result;
      emit("refresh");
    }
  } catch (err) {
    console.error("Import failed:", err);
    alert("Import failed: " + (err as Error).message);
  } finally {
    isImporting.value = false;
  }
}

function copyCode() {
  if (shareCode.value) {
    navigator.clipboard.writeText(shareCode.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
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
    <div class="min-w-[400px]">
      <!-- Tabs -->
      <div class="flex border-b border-border mb-4">
        <button
          v-if="modpackId"
          class="flex-1 py-2 px-4 text-sm font-medium transition-colors border-b-2"
          :class="activeTab === 'export' 
            ? 'border-primary text-primary' 
            : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'export'"
        >
          <Upload class="inline w-4 h-4 mr-1.5" />
          Export
        </button>
        <button
          class="flex-1 py-2 px-4 text-sm font-medium transition-colors border-b-2"
          :class="activeTab === 'import' 
            ? 'border-primary text-primary' 
            : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'import'"
        >
          <Download class="inline w-4 h-4 mr-1.5" />
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
              <Check v-if="copied" class="w-4 h-4 text-green-500" />
              <Copy v-else class="w-4 h-4" />
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

        <!-- Export Button -->
        <Button 
          class="w-full" 
          @click="exportModex" 
          :disabled="isExporting"
        >
          <RefreshCw v-if="isExporting" class="w-4 h-4 mr-2 animate-spin" />
          <Share2 v-else class="w-4 h-4 mr-2" />
          {{ isExporting ? 'Exporting...' : 'Export as .modex' }}
        </Button>

        <!-- Export Success -->
        <div v-if="exportSuccess" class="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-sm">
          <div class="font-medium">✓ Exported successfully!</div>
          <div class="text-xs mt-1 opacity-70 truncate">{{ exportPath }}</div>
          <div class="text-xs mt-2">
            Share the <strong>.modex</strong> file and the code <strong>{{ shareCode }}</strong> with your friends.
          </div>
        </div>
      </div>

      <!-- Import Tab -->
      <div v-if="activeTab === 'import'" class="space-y-4">
        <div class="p-4 rounded-lg bg-muted/50 border border-border">
          <div class="text-sm font-medium mb-1">Import Modpack</div>
          <div class="text-xs text-muted-foreground">
            Import a .modex file shared by someone else
          </div>
        </div>

        <!-- Import Button -->
        <Button 
          class="w-full" 
          @click="importModex" 
          :disabled="isImporting"
        >
          <RefreshCw v-if="isImporting" class="w-4 h-4 mr-2 animate-spin" />
          <Download v-else class="w-4 h-4 mr-2" />
          {{ isImporting ? 'Importing...' : 'Select .modex file' }}
        </Button>

        <!-- Import Result -->
        <div v-if="importResult" class="p-4 rounded-lg border text-sm space-y-2"
          :class="importResult.isUpdate 
            ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
            : 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'">
          
          <div class="font-medium">
            {{ importResult.isUpdate ? '↻ Modpack Updated!' : '✓ Modpack Imported!' }}
          </div>
          
          <div class="text-xs opacity-70">
            Code: <span class="font-mono">{{ importResult.code }}</span>
          </div>
          
          <div v-if="importResult.changes" class="flex gap-4 text-xs mt-2">
            <span class="text-green-500">+{{ importResult.changes.added }} added</span>
            <span class="text-red-500">-{{ importResult.changes.removed }} removed</span>
            <span class="text-muted-foreground">{{ importResult.changes.unchanged }} unchanged</span>
          </div>
        </div>

        <!-- How it works -->
        <div class="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
          <div class="font-medium mb-2">How it works:</div>
          <div>1. Get a <strong>.modex</strong> file from a friend</div>
          <div>2. Click "Select .modex file" to import</div>
          <div>3. If you already have this modpack, it will update</div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button variant="outline" @click="$emit('close')">Close</Button>
    </template>
  </Dialog>
</template>
