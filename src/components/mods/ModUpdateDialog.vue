<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useToast } from "@/composables/useToast";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Icon from "@/components/ui/Icon.vue";
import ChangelogDialog from "./ChangelogDialog.vue";
import type { ModUpdateInfo } from "@/types/electron";

const props = defineProps<{
  open: boolean;
  mod: any; // The mod object from the list
  modpackId?: string; // Optional context
  loader?: string;
  minecraftVersion?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "updated", newFileId: number, newModId?: string): void;
}>();

const toast = useToast();

const isLoading = ref(false);
const updateInfo = ref<ModUpdateInfo | null>(null);
const updateChecked = ref(false);
const isUpdating = ref(false);

// Changelog
const changelogOpen = ref(false);

const hasUpdate = computed(() => updateInfo.value?.hasUpdate || false);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      updateInfo.value = null;
      updateChecked.value = false;
      checkUpdate();
    }
  }
);

async function checkUpdate() {
  if (!props.mod?.cf_project_id) {
    updateChecked.value = true;
    return;
  }

  isLoading.value = true;
  try {
    const result = await window.api.updates.checkMod(
      props.mod.cf_project_id,
      props.minecraftVersion || props.mod.game_version || "1.20.1",
      props.loader || props.mod.loader || "forge",
      props.mod.content_type || "mod"
    );

    if (result) {
      // Manually construct ModUpdateInfo from result
      updateInfo.value = {
        modId: props.mod.id,
        currentVersion: props.mod.version,
        latestVersion:
          result.id !== props.mod.cf_file_id
            ? result.displayName
            : props.mod.version,
        hasUpdate: result.id !== props.mod.cf_file_id,
        newFileId: result.id !== props.mod.cf_file_id ? result.id : undefined,
        projectId: props.mod.cf_project_id.toString(),
        projectName: props.mod.name,
        source: "curseforge",
        updateUrl: result.downloadUrl,
        releaseDate: result.fileDate,
        changelog: null,
      };
    } else {
      // Fallback for no result
      updateInfo.value = {
        modId: props.mod.id,
        currentVersion: props.mod.version,
        latestVersion: props.mod.version,
        hasUpdate: false,
        projectId: props.mod.cf_project_id.toString(),
        projectName: props.mod.name,
        source: "curseforge",
        updateUrl: null,
        changelog: undefined,
        releaseDate: undefined,
      };
    }
  } catch (err) {
    console.error("Failed to check update:", err);
    toast.error("Couldn't check", (err as Error).message);
  } finally {
    isLoading.value = false;
    updateChecked.value = true;
  }
}

async function applyUpdate() {
  if (!updateInfo.value?.newFileId) return;

  isUpdating.value = true;
  try {
    const result = await window.api.updates.applyUpdate(
      props.mod.id,
      updateInfo.value.newFileId,
      props.modpackId // Pass modpackId to update only in this modpack context
    );
    if (result.success) {
      toast.success("Updated ✓", `${props.mod.name} is now up to date.`);
      emit("updated", updateInfo.value.newFileId, result.newModId);
      emit("close");
    } else {
      toast.error("Couldn't update", result.error || "Unknown error");
    }
  } catch (err) {
    toast.error("Couldn't update", (err as Error).message);
  } finally {
    isUpdating.value = false;
  }
}

function openChangelog() {
  if (updateInfo.value?.projectId && updateInfo.value?.newFileId) {
    changelogOpen.value = true;
  }
}
</script>

<template>
  <Dialog :open="open" :title="`Aggiornamento: ${mod?.name}`" maxWidth="md" @close="$emit('close')">
    <div class="space-y-6 py-4">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <Icon name="RefreshCw" class="w-8 h-8 animate-spin mb-3 text-primary" />
        <p>Controllo aggiornamenti su CurseForge...</p>
      </div>

      <!-- Result State -->
      <div v-else-if="updateChecked && updateInfo">
        <!-- Update Available -->
        <div v-if="hasUpdate" class="space-y-6">
          <div class="flex items-center justify-center p-4 rounded-full bg-emerald-500/10 w-16 h-16 mx-auto">
            <Icon name="Download" class="w-8 h-8 text-emerald-500" />
          </div>

          <div class="text-center space-y-2">
            <h3 class="text-lg font-semibold">Nuova versione disponibile!</h3>
            <p class="text-sm text-muted-foreground">
              È disponibile un aggiornamento per {{ mod.name }}
            </p>
          </div>

          <!-- Version Comparison -->
          <div class="flex items-center justify-center gap-4 py-4 bg-muted/30 rounded-lg border border-border">
            <div class="text-center">
              <div class="text-xs text-muted-foreground mb-1">Attuale</div>
              <div class="font-mono text-sm bg-background px-2 py-1 rounded border border-border">
                {{ mod.version }}
              </div>
            </div>
            <Icon name="ArrowRight" class="w-4 h-4 text-muted-foreground" />
            <div class="text-center">
              <div class="text-xs text-muted-foreground mb-1">Nuova</div>
              <div
                class="font-mono text-sm text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 font-bold">
                {{ updateInfo.latestVersion }}
              </div>
            </div>
          </div>

          <div class="text-xs text-center text-muted-foreground">
            Rilasciato il:
            {{
              new Date(
                updateInfo.releaseDate || Date.now()
              ).toLocaleDateString()
            }}
          </div>
        </div>

        <!-- No Update -->
        <div v-else class="text-center py-6">
          <div class="flex items-center justify-center p-4 rounded-full bg-secondary w-16 h-16 mx-auto mb-4">
            <Icon name="CheckCircle" class="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 class="font-medium text-lg">Nessun aggiornamento</h3>
          <p class="text-muted-foreground mt-2">
            Stai usando l'ultima versione disponibile.
          </p>

          <div class="mt-4 font-mono text-sm bg-muted/50 inline-block px-3 py-1 rounded">
            {{ mod.version }}
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-between w-full">
        <Button v-if="hasUpdate" variant="ghost" @click="openChangelog" class="gap-2">
          <Icon name="FileText" class="w-4 h-4" /> Vedi Changelog
        </Button>
        <div v-else></div>
        <!-- Spacer -->

        <div class="flex gap-2">
          <Button variant="ghost" @click="$emit('close')">Chiudi</Button>
          <Button v-if="hasUpdate" @click="applyUpdate" :disabled="isUpdating" class="gap-2">
            <Icon v-if="isUpdating" name="RefreshCw" class="w-4 h-4 animate-spin" />
            <Icon v-else name="Download" class="w-4 h-4" />
            {{ isUpdating ? "Aggiornamento..." : "Aggiorna Ora" }}
          </Button>
        </div>
      </div>
    </template>
  </Dialog>

  <!-- Nested Changelog Dialog -->
  <ChangelogDialog v-if="updateInfo && hasUpdate" :open="changelogOpen" :mod-id="parseInt(updateInfo.projectId || '0')"
    :file-id="updateInfo.newFileId || 0" :mod-name="mod?.name" :version="updateInfo.latestVersion || ''"
    @close="changelogOpen = false" />
</template>
