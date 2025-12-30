<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useToast } from "@/composables/useToast";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import {
  RefreshCw,
  Download,
  Check,
  X,
  ExternalLink,
  AlertCircle,
  Key,
  Settings,
  ArrowUpCircle,
  FileText,
} from "lucide-vue-next";
import ChangelogDialog from "./ChangelogDialog.vue";
import type { ModUpdateInfo } from "@/types/electron";

const props = defineProps<{
  open: boolean;
  modpackId?: string; // Se fornito, controlla solo le mod del modpack
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "updated"): void;
}>();

const toast = useToast();

// State
const isLoading = ref(false);
const checkProgress = ref({ current: 0, total: 0, modName: "" });
const updates = ref<ModUpdateInfo[]>([]);
const updatingMods = ref<Set<string>>(new Set());
const showSettings = ref(false);
const curseforgeApiKey = ref("");
const savingKey = ref(false);

// Changelog
const changelogOpen = ref(false);
const selectedChangelogMod = ref<{
  id: number;
  name: string;
  fileId: number;
  version: string;
  slug: string;
} | null>(null);

function getSlugFromUrl(url: string | null): string {
  if (!url) return "";
  try {
    const match = url.match(/\/mc-mods\/([^\/]+)/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function viewChangelog(update: ModUpdateInfo) {
  if (!update.projectId || !update.newFileId) return;

  selectedChangelogMod.value = {
    id: parseInt(update.projectId),
    fileId: update.newFileId,
    name: update.projectName || "Unknown Mod",
    version: update.latestVersion || "",
    slug: getSlugFromUrl(update.updateUrl),
  };
  changelogOpen.value = true;
}

// Computed
const availableUpdates = computed(() =>
  updates.value.filter((u) => u.hasUpdate)
);
const checkedCount = computed(() => updates.value.length);
const updateCount = computed(() => availableUpdates.value.length);

// Load API key on open
watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      updates.value = [];
      try {
        curseforgeApiKey.value = await window.api.updates.getApiKey();
      } catch (err) {
        console.error("Failed to load API key:", err);
      }
    }
  }
);

async function checkForUpdates() {
  isLoading.value = true;
  updates.value = [];
  checkProgress.value = { current: 0, total: 0, modName: "" };

  // Listen for progress updates
  const progressHandler = (data: {
    current: number;
    total: number;
    modName: string;
  }) => {
    checkProgress.value = data;
  };
  window.api.on("updates:progress", progressHandler);

  try {
    if (props.modpackId) {
      updates.value = await window.api.updates.checkModpack(props.modpackId);
    } else {
      updates.value = await window.api.updates.checkAll();
    }
  } catch (err) {
    console.error("Failed to check updates:", err);
    toast.error("Update Check Failed", (err as Error).message);
  } finally {
    window.ipcRenderer?.off("updates:progress", progressHandler as any);
    isLoading.value = false;
  }
}

async function applyUpdate(update: ModUpdateInfo) {
  if (!update.newFileId) {
    toast.info(
      "Not Available",
      "Aggiornamento non disponibile. Visita la pagina della mod per informazioni."
    );
    return;
  }

  updatingMods.value.add(update.modId);

  try {
    // In metadata-only mode, we just update the mod reference to the new file ID
    const result = await window.api.updates.applyUpdate(
      update.modId,
      update.newFileId!
    );

    if (result.success) {
      // Rimuovi dalla lista
      updates.value = updates.value.filter((u) => u.modId !== update.modId);
      emit("updated");
    } else {
      toast.error("Update Failed", result.error || "Unknown error");
    }
  } catch (err) {
    toast.error("Error", (err as Error).message);
  } finally {
    updatingMods.value.delete(update.modId);
  }
}

// Helper to process in parallel batches
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 5
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

async function applyAllUpdates() {
  const updatesToApply = availableUpdates.value.filter((u) => u.newFileId);
  if (updatesToApply.length === 0) return;

  // Mark all as updating
  for (const update of updatesToApply) {
    updatingMods.value.add(update.modId);
  }

  try {
    // Process updates in parallel batches
    await processBatch(
      updatesToApply,
      async (update) => {
        try {
          const result = await window.api.updates.applyUpdate(
            update.modId,
            update.newFileId!
          );
          if (result.success) {
            updates.value = updates.value.filter((u) => u.modId !== update.modId);
          }
        } catch (err) {
          console.error(`Failed to update ${update.projectName}:`, err);
        } finally {
          updatingMods.value.delete(update.modId);
        }
      },
      5
    );
    emit("updated");
  } catch (err) {
    toast.error("Error", (err as Error).message);
  }
}

async function saveApiKey() {
  savingKey.value = true;
  try {
    await window.api.updates.setApiKey(curseforgeApiKey.value);
    showSettings.value = false;
    toast.success(
      "API Key Saved",
      "CurseForge API key has been saved successfully."
    );
  } catch (err) {
    toast.error("Save Failed", (err as Error).message);
  } finally {
    savingKey.value = false;
  }
}

function openUrl(url: string | null) {
  if (url) {
    window.open(url, "_blank");
  }
}

function getSourceColor(source: string) {
  switch (source) {
    case "curseforge":
      return "text-orange-500";
    case "modrinth":
      return "text-green-500";
    default:
      return "text-muted-foreground";
  }
}

function getSourceLabel(source: string) {
  switch (source) {
    case "curseforge":
      return "CurseForge";
    case "modrinth":
      return "Modrinth";
    default:
      return "Sconosciuto";
  }
}
</script>

<template>
  <Dialog :open="open" title="Aggiornamenti Mod" maxWidth="2xl" @close="$emit('close')">
    <div class="max-h-[70vh] flex flex-col overflow-hidden">
      <!-- Header Actions -->
      <div class="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <div class="flex items-center gap-2">
          <Button @click="checkForUpdates" :disabled="isLoading" class="gap-2">
            <RefreshCw :class="['w-4 h-4', isLoading && 'animate-spin']" />
            {{ isLoading ? "Controllo..." : "Controlla Aggiornamenti" }}
          </Button>

          <Button v-if="updateCount > 0" @click="applyAllUpdates" variant="secondary" class="gap-2">
            <Download class="w-4 h-4" />
            Aggiorna Tutti ({{ updateCount }})
          </Button>
        </div>

        <Button variant="ghost" size="icon" @click="showSettings = !showSettings" title="Impostazioni API">
          <Settings class="w-4 h-4" />
        </Button>
      </div>

      <!-- Settings Panel -->
      <div v-if="showSettings" class="mb-4 p-4 rounded-lg bg-muted/50 border border-border space-y-3">
        <div class="text-sm font-medium flex items-center gap-2">
          <Key class="w-4 h-4" />
          API Keys
        </div>

        <!-- Progress indicator during check -->
        <div v-if="isLoading && checkProgress.total > 0" class="mb-4 p-3 rounded-lg bg-muted/30 border border-border">
          <div class="flex items-center justify-between text-sm mb-2">
            <span class="text-muted-foreground">Controllo aggiornamenti...</span>
            <span class="font-medium">{{ checkProgress.current }} / {{ checkProgress.total }}</span>
          </div>
          <div class="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div class="bg-primary h-full transition-all duration-300" :style="{
              width: `${(checkProgress.current / checkProgress.total) * 100
                }%`,
            }"></div>
          </div>
          <div v-if="checkProgress.modName" class="text-xs text-muted-foreground mt-1.5 truncate">
            {{ checkProgress.modName }}
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs text-muted-foreground">CurseForge API Key</label>
          <div class="flex gap-2">
            <Input v-model="curseforgeApiKey" type="password" placeholder="Inserisci la tua API key..."
              class="flex-1" />
            <Button @click="saveApiKey" :disabled="savingKey" size="sm">
              {{ savingKey ? "Salvo..." : "Salva" }}
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            Ottieni una API key gratuita su
            <a href="https://console.curseforge.com/" target="_blank" class="text-primary hover:underline">
              console.curseforge.com
            </a>
          </p>
        </div>

        <div class="text-xs text-muted-foreground pt-2 border-t border-border">
          <strong>Modrinth:</strong> Non richiede API key
        </div>
      </div>

      <!-- No API Key Warning -->
      <div v-if="!curseforgeApiKey && !showSettings"
        class="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-sm flex items-start gap-2">
        <AlertCircle class="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <div class="font-medium">API Key CurseForge mancante</div>
          <div class="text-xs opacity-80">
            Clicca sull'icona ingranaggio per configurare la API key e abilitare il controllo
            aggiornamenti da CurseForge.
          </div>
        </div>
      </div>

      <!-- Results -->
      <div v-if="checkedCount > 0" class="mb-2 text-sm text-muted-foreground">
        {{ checkedCount }} mod controllate, {{ updateCount }} aggiornamenti
        disponibili
      </div>

      <!-- Progress indicator during check -->
      <div v-if="isLoading && checkProgress.total > 0" class="mb-4 space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">Controllo aggiornamenti...</span>
          <span class="font-medium">{{ checkProgress.current }} / {{ checkProgress.total }}</span>
        </div>
        <div class="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div class="bg-primary h-full transition-all duration-300" :style="{
            width: `${(checkProgress.current / checkProgress.total) * 100}%`,
          }"></div>
        </div>
        <div v-if="checkProgress.modName" class="text-xs text-muted-foreground truncate">
          {{ checkProgress.modName }}
        </div>
      </div>

      <!-- Update List -->
      <div class="flex-1 overflow-auto space-y-2">
        <!-- Empty State -->
        <div v-if="!isLoading && updates.length === 0" class="text-center py-8 text-muted-foreground">
          <ArrowUpCircle class="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Clicca "Controlla Aggiornamenti" per cercare nuove versioni</p>
        </div>

        <!-- No Updates -->
        <div v-else-if="!isLoading && updateCount === 0 && updates.length > 0" class="text-center py-8">
          <Check class="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p class="text-green-600 dark:text-green-400 font-medium">
            Tutte le mod sono aggiornate!
          </p>
        </div>

        <!-- Update Items -->
        <div v-for="update in availableUpdates" :key="update.modId"
          class="p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors overflow-hidden">
          <div class="flex items-start justify-between gap-3 min-w-0">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium truncate">{{
                  update.projectName || update.modId
                }}</span>
                <span :class="['text-xs', getSourceColor(update.source)]">
                  {{ getSourceLabel(update.source) }}
                </span>
              </div>

              <div class="flex items-center gap-2 mt-1 text-sm">
                <span class="text-muted-foreground">{{
                  update.currentVersion
                }}</span>
                <span class="text-muted-foreground">→</span>
                <span class="text-green-500 font-medium">{{
                  update.latestVersion
                }}</span>
              </div>

              <div v-if="update.releaseDate" class="text-xs text-muted-foreground mt-1">
                Rilasciato:
                {{ new Date(update.releaseDate).toLocaleDateString() }}
              </div>
            </div>

            <div class="flex items-center gap-1">
              <Button v-if="update.updateUrl" variant="ghost" size="icon" class="h-8 w-8"
                @click="openUrl(update.updateUrl)" title="Apri pagina mod">
                <ExternalLink class="w-4 h-4" />
              </Button>

              <Button v-if="update.projectId && update.newFileId" variant="ghost" size="icon"
                class="h-8 w-8 text-muted-foreground" @click="viewChangelog(update)" title="Vedi Changelog">
                <FileText class="w-4 h-4" />
              </Button>

              <Button v-if="update.newFileId" size="sm" class="gap-1" :disabled="updatingMods.has(update.modId)"
                @click="applyUpdate(update)">
                <RefreshCw v-if="updatingMods.has(update.modId)" class="w-3 h-3 animate-spin" />
                <Download v-else class="w-3 h-3" />
                {{
                  updatingMods.has(update.modId) ? "Aggiorno..." : "Aggiorna"
                }}
              </Button>

              <Button v-else variant="outline" size="sm" @click="openUrl(update.updateUrl)">
                <ExternalLink class="w-3 h-3 mr-1" />
                Manuale
              </Button>
            </div>
          </div>
        </div>

        <!-- Unknown Source Mods -->
        <div v-if="updates.filter((u) => u.source === 'unknown').length > 0" class="mt-4 pt-4 border-t border-border">
          <div class="text-xs text-muted-foreground mb-2">
            {{updates.filter((u) => u.source === "unknown").length}} mod non
            riconosciute (fonte sconosciuta)
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button variant="outline" @click="$emit('close')">Chiudi</Button>
    </template>
  </Dialog>

  <ChangelogDialog v-if="selectedChangelogMod" :open="changelogOpen" :mod-id="selectedChangelogMod.id"
    :file-id="selectedChangelogMod.fileId" :mod-name="selectedChangelogMod.name" :version="selectedChangelogMod.version"
    :slug="selectedChangelogMod.slug" @close="changelogOpen = false" />
</template>
