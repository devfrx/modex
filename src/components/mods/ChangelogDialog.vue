<script setup lang="ts">
import { ref, watch } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import { RefreshCw, ExternalLink, FileText } from "lucide-vue-next";

const props = defineProps<{
  open: boolean;
  modId: number;
  fileId: number;
  modName: string;
  version: string;
  slug?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const changelog = ref("");
const isLoading = ref(false);
const error = ref<string | null>(null);

async function loadChangelog() {
  if (!props.modId || !props.fileId) return;

  isLoading.value = true;
  error.value = null;

  try {
    changelog.value = await window.api.curseforge.getChangelog(
      props.modId,
      props.fileId
    );
  } catch (err) {
    console.error("Failed to load changelog:", err);
    error.value = (err as Error).message;
    changelog.value = "";
  } finally {
    isLoading.value = false;
  }
}

function openCurseForge() {
  if (props.slug) {
    window.open(
      `https://www.curseforge.com/minecraft/mc-mods/${props.slug}/files/${props.fileId}`,
      "_blank"
    );
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      loadChangelog();
    } else {
      changelog.value = "";
      error.value = null;
    }
  },
  { immediate: true }
);
</script>

<template>
  <Dialog :open="open" @close="emit('close')" maxWidth="2xl">
    <template #header>
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-primary/10">
          <FileText class="w-5 h-5 text-primary" />
        </div>
        <div class="min-w-0">
          <h2 class="text-lg font-bold truncate">{{ modName }}</h2>
          <p class="text-sm text-muted-foreground">{{ version }}</p>
        </div>
      </div>
    </template>

    <div class="min-h-[200px] max-h-[400px] overflow-y-auto">
      <!-- Loading -->
      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <RefreshCw class="w-6 h-6 animate-spin text-primary" />
        <span class="ml-2 text-muted-foreground">Loading changelog...</span>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-12">
        <p class="text-red-500 mb-4">{{ error }}</p>
        <Button variant="outline" @click="loadChangelog">
          <RefreshCw class="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>

      <!-- Changelog Content -->
      <div
        v-else
        class="prose prose-sm prose-invert max-w-none p-4 prose-headings:text-foreground prose-headings:font-semibold prose-p:text-muted-foreground prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-ul:text-muted-foreground prose-ol:text-muted-foreground prose-li:marker:text-muted-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-muted prose-pre:border prose-pre:border-border"
        v-html="changelog"
      />
    </div>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <Button v-if="slug" variant="ghost" size="sm" @click="openCurseForge">
          <ExternalLink class="w-4 h-4 mr-2" />
          View on CurseForge
        </Button>
        <div v-else></div>
        <Button @click="emit('close')">Close</Button>
      </div>
    </template>
  </Dialog>
</template>
