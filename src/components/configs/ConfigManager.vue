<script setup lang="ts">
/**
 * ConfigManager - Full config management panel
 * 
 * Combines:
 * - ConfigBrowser (file tree)
 * - ConfigEditor (file editing)
 * - Compare tool
 * - Copy between instances
 */
import { ref, computed, watch } from "vue";
import { useToast } from "@/composables/useToast";
import ConfigBrowser from "./ConfigBrowser.vue";
import ConfigEditor from "./ConfigEditor.vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import {
  Settings,
  GitCompare,
  Copy,
  ArrowRight,
  Check,
  X,
  ChevronDown,
  Loader2,
  Plus,
  Minus,
  Equal,
} from "lucide-vue-next";
import type { ConfigFile, ConfigComparison, ModexInstance } from "@/types";

const props = defineProps<{
  instanceId: string;
  instanceName: string;
}>();

const toast = useToast();

// State
const selectedFile = ref<ConfigFile | null>(null);
const showCompareDialog = ref(false);
const showCopyDialog = ref(false);

// All instances for compare/copy
const allInstances = ref<ModexInstance[]>([]);
const isLoadingInstances = ref(false);

// Compare state
const compareInstanceId = ref<string | null>(null);
const comparison = ref<ConfigComparison | null>(null);
const isComparing = ref(false);

// Copy state
const copyTargetId = ref<string | null>(null);
const isCopying = ref(false);
const selectedFolderToCopy = ref<string>("config");

// Load all instances
async function loadInstances() {
  isLoadingInstances.value = true;
  try {
    allInstances.value = await window.api.instances.getAll();
  } catch (error: any) {
    console.error("Failed to load instances:", error);
  } finally {
    isLoadingInstances.value = false;
  }
}

// Other instances (exclude current)
const otherInstances = computed(() => 
  allInstances.value.filter(i => i.id !== props.instanceId)
);

// Handle file selection
function handleFileOpen(file: ConfigFile) {
  selectedFile.value = file;
}

// Compare configs with another instance
async function compareWithInstance() {
  if (!compareInstanceId.value) return;

  isComparing.value = true;
  try {
    comparison.value = await window.api.configs.compare(
      props.instanceId,
      compareInstanceId.value,
      "config"
    );
  } catch (error: any) {
    console.error("Compare failed:", error);
    toast.error("Compare failed", error.message);
  } finally {
    isComparing.value = false;
  }
}

// Copy configs to another instance
async function copyToInstance() {
  if (!copyTargetId.value) return;

  isCopying.value = true;
  try {
    const result = await window.api.configs.copyFolder(
      props.instanceId,
      copyTargetId.value,
      selectedFolderToCopy.value,
      true
    );
    toast.success("Configs copied", `${result.copied} files copied`);
    showCopyDialog.value = false;
  } catch (error: any) {
    console.error("Copy failed:", error);
    toast.error("Copy failed", error.message);
  } finally {
    isCopying.value = false;
  }
}

// Open compare dialog
function openCompare() {
  loadInstances();
  comparison.value = null;
  compareInstanceId.value = null;
  showCompareDialog.value = true;
}

// Open copy dialog
function openCopy() {
  loadInstances();
  copyTargetId.value = null;
  showCopyDialog.value = true;
}

// Get instance name by ID
function getInstanceName(id: string): string {
  return allInstances.value.find(i => i.id === id)?.name || "Unknown";
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Toolbar -->
    <div class="flex items-center justify-between p-2 border-b border-border bg-muted/30">
      <h3 class="text-sm font-medium flex items-center gap-2">
        <Settings class="w-4 h-4" />
        Config Manager
      </h3>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="openCompare">
          <GitCompare class="w-4 h-4 mr-1.5" />
          Compare
        </Button>
        <Button variant="outline" size="sm" @click="openCopy">
          <Copy class="w-4 h-4 mr-1.5" />
          Copy To...
        </Button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Browser Panel -->
      <div class="w-80 border-r border-border">
        <ConfigBrowser
          :instance-id="instanceId"
          :instance-name="instanceName"
          @open-file="handleFileOpen"
        />
      </div>

      <!-- Editor Panel -->
      <div class="flex-1">
        <ConfigEditor
          :instance-id="instanceId"
          :file="selectedFile"
          @saved="() => {}"
        />
      </div>
    </div>

    <!-- Compare Dialog -->
    <Dialog :open="showCompareDialog" title="Compare Configs" @close="showCompareDialog = false">
      <div class="space-y-4">
        <!-- Instance Selection -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Compare with instance:</label>
          <select
            v-model="compareInstanceId"
            class="w-full px-3 py-2 rounded-lg border border-border bg-background"
            :disabled="isLoadingInstances"
          >
            <option :value="null">Select an instance...</option>
            <option
              v-for="instance in otherInstances"
              :key="instance.id"
              :value="instance.id"
            >
              {{ instance.name }} ({{ instance.minecraftVersion }})
            </option>
          </select>
        </div>

        <!-- Compare Button -->
        <Button
          class="w-full"
          @click="compareWithInstance"
          :disabled="!compareInstanceId || isComparing"
        >
          <GitCompare v-if="!isComparing" class="w-4 h-4 mr-2" />
          <Loader2 v-else class="w-4 h-4 mr-2 animate-spin" />
          Compare Configs
        </Button>

        <!-- Comparison Results -->
        <div v-if="comparison" class="space-y-4 pt-4 border-t border-border">
          <h4 class="font-medium">Comparison Results</h4>

          <!-- Summary -->
          <div class="grid grid-cols-3 gap-3">
            <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
              <div class="text-2xl font-bold text-green-500">{{ comparison.onlyInFirst.length }}</div>
              <div class="text-xs text-muted-foreground">Only in {{ instanceName }}</div>
            </div>
            <div class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
              <div class="text-2xl font-bold text-amber-500">{{ comparison.different.length }}</div>
              <div class="text-xs text-muted-foreground">Different</div>
            </div>
            <div class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
              <div class="text-2xl font-bold text-blue-500">{{ comparison.onlyInSecond.length }}</div>
              <div class="text-xs text-muted-foreground">Only in {{ getInstanceName(compareInstanceId!) }}</div>
            </div>
          </div>

          <!-- Details -->
          <div class="max-h-64 overflow-auto space-y-2">
            <!-- Only in first -->
            <div v-if="comparison.onlyInFirst.length > 0">
              <div class="text-xs font-medium text-green-500 mb-1 flex items-center gap-1">
                <Plus class="w-3 h-3" /> Only in {{ instanceName }}
              </div>
              <div
                v-for="file in comparison.onlyInFirst.slice(0, 10)"
                :key="file"
                class="text-xs text-muted-foreground truncate"
              >
                {{ file }}
              </div>
              <div v-if="comparison.onlyInFirst.length > 10" class="text-xs text-muted-foreground">
                ... and {{ comparison.onlyInFirst.length - 10 }} more
              </div>
            </div>

            <!-- Different -->
            <div v-if="comparison.different.length > 0">
              <div class="text-xs font-medium text-amber-500 mb-1 flex items-center gap-1">
                <Equal class="w-3 h-3" /> Different content
              </div>
              <div
                v-for="file in comparison.different.slice(0, 10)"
                :key="file"
                class="text-xs text-muted-foreground truncate"
              >
                {{ file }}
              </div>
              <div v-if="comparison.different.length > 10" class="text-xs text-muted-foreground">
                ... and {{ comparison.different.length - 10 }} more
              </div>
            </div>

            <!-- Only in second -->
            <div v-if="comparison.onlyInSecond.length > 0">
              <div class="text-xs font-medium text-blue-500 mb-1 flex items-center gap-1">
                <Minus class="w-3 h-3" /> Only in {{ getInstanceName(compareInstanceId!) }}
              </div>
              <div
                v-for="file in comparison.onlyInSecond.slice(0, 10)"
                :key="file"
                class="text-xs text-muted-foreground truncate"
              >
                {{ file }}
              </div>
              <div v-if="comparison.onlyInSecond.length > 10" class="text-xs text-muted-foreground">
                ... and {{ comparison.onlyInSecond.length - 10 }} more
              </div>
            </div>

            <!-- Identical -->
            <div v-if="comparison.identical.length > 0" class="text-xs text-muted-foreground">
              {{ comparison.identical.length }} files are identical
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <Button variant="outline" @click="showCompareDialog = false">Close</Button>
        </div>
      </div>
    </Dialog>

    <!-- Copy Dialog -->
    <Dialog :open="showCopyDialog" title="Copy Configs" @close="showCopyDialog = false">
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Copy config files from <strong>{{ instanceName }}</strong> to another instance.
        </p>

        <!-- Folder Selection -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Folder to copy:</label>
          <select
            v-model="selectedFolderToCopy"
            class="w-full px-3 py-2 rounded-lg border border-border bg-background"
          >
            <option value="config">config/</option>
            <option value="kubejs">kubejs/</option>
            <option value="defaultconfigs">defaultconfigs/</option>
            <option value="scripts">scripts/</option>
          </select>
        </div>

        <!-- Target Instance Selection -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Copy to instance:</label>
          <select
            v-model="copyTargetId"
            class="w-full px-3 py-2 rounded-lg border border-border bg-background"
            :disabled="isLoadingInstances"
          >
            <option :value="null">Select an instance...</option>
            <option
              v-for="instance in otherInstances"
              :key="instance.id"
              :value="instance.id"
            >
              {{ instance.name }} ({{ instance.minecraftVersion }})
            </option>
          </select>
        </div>

        <!-- Visual -->
        <div class="flex items-center justify-center gap-4 py-4 px-4 rounded-lg bg-muted/50">
          <div class="text-center">
            <div class="font-medium">{{ instanceName }}</div>
            <div class="text-xs text-muted-foreground">{{ selectedFolderToCopy }}/</div>
          </div>
          <ArrowRight class="w-5 h-5 text-primary" />
          <div class="text-center">
            <div class="font-medium">{{ copyTargetId ? getInstanceName(copyTargetId) : "..." }}</div>
            <div class="text-xs text-muted-foreground">{{ selectedFolderToCopy }}/</div>
          </div>
        </div>

        <p class="text-xs text-amber-500">
          ⚠️ This will overwrite existing files in the target instance.
        </p>

        <div class="flex justify-end gap-2">
          <Button variant="outline" @click="showCopyDialog = false">Cancel</Button>
          <Button
            @click="copyToInstance"
            :disabled="!copyTargetId || isCopying"
          >
            <Copy v-if="!isCopying" class="w-4 h-4 mr-1.5" />
            <Loader2 v-else class="w-4 h-4 mr-1.5 animate-spin" />
            Copy Configs
          </Button>
        </div>
      </div>
    </Dialog>
  </div>
</template>
