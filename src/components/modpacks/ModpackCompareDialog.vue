<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
  AlertTriangle,
  Check,
  Lock,
  Package,
  Copy,
  Merge,
  FileDown,
  RefreshCw,
  ArrowUpDown,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import { useToast } from "@/composables/useToast";
import type { Mod, Modpack } from "@/types/electron";

const props = defineProps<{
  open: boolean;
  preSelectedPackA?: string;
  preSelectedPackB?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const toast = useToast();
const modpacks = ref<Modpack[]>([]);
const packAId = ref<string | null>(null);
const packBId = ref<string | null>(null);
const packAMods = ref<Mod[]>([]);
const packBMods = ref<Mod[]>([]);
const isLoading = ref(false);
const isCopying = ref(false);
const isSyncing = ref(false);
const activeView = ref<'differences' | 'versions'>('differences');

// Get selected modpacks
const packA = computed(() =>
  modpacks.value.find((p) => p.id === packAId.value)
);
const packB = computed(() =>
  modpacks.value.find((p) => p.id === packBId.value)
);

// Check if versions/loaders are compatible
const areCompatible = computed(() => {
  if (!packA.value || !packB.value) return true;
  return (
    packA.value.minecraft_version === packB.value.minecraft_version &&
    packA.value.loader === packB.value.loader
  );
});

// Helper to get project ID (independent of version)
function getProjectId(mod: Mod): string {
  // Use cf_project_id or mr_project_id for comparison (version-independent)
  if (mod.cf_project_id) return `cf-${mod.cf_project_id}`;
  if (mod.mr_project_id) return `mr-${mod.mr_project_id}`;
  // Fallback: extract project ID from mod.id (format: "cf-{projectId}-{fileId}")
  const parts = mod.id?.split('-') || [];
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return mod.id || mod.name; // Last resort
}

// Computed comparisons - use projectId for matching (version-independent)
const onlyInA = computed(() => {
  const bProjectIds = new Set(packBMods.value.map((m) => getProjectId(m)));
  return packAMods.value.filter((m) => !bProjectIds.has(getProjectId(m)));
});

const onlyInB = computed(() => {
  const aProjectIds = new Set(packAMods.value.map((m) => getProjectId(m)));
  return packBMods.value.filter((m) => !aProjectIds.has(getProjectId(m)));
});

const common = computed(() => {
  const bProjectIds = new Set(packBMods.value.map((m) => getProjectId(m)));
  return packAMods.value.filter((m) => bProjectIds.has(getProjectId(m)));
});

// Version differences - mods in both packs but with different versions
const versionDiffs = computed(() => {
  const bModsMap = new Map(packBMods.value.map((m) => [getProjectId(m), m]));
  const diffs: Array<{ modA: Mod; modB: Mod; name: string; projectId: string }> = [];

  for (const modA of packAMods.value) {
    const projectId = getProjectId(modA);
    const modB = bModsMap.get(projectId);
    if (modB && modA.version !== modB.version) {
      diffs.push({
        modA,
        modB,
        name: modA.name,
        projectId,
      });
    }
  }
  return diffs;
});

// Stats summary
const stats = computed(() => ({
  onlyInA: onlyInA.value.length,
  onlyInB: onlyInB.value.length,
  common: common.value.length,
  versionDiffs: versionDiffs.value.length,
  totalA: packAMods.value.length,
  totalB: packBMods.value.length,
}));

async function loadModpacks() {
  if (!window.api) return;
  modpacks.value = await window.api.modpacks.getAll();
}

async function loadComparison() {
  if (!packAId.value || !packBId.value) return;
  isLoading.value = true;
  try {
    const [modsA, modsB] = await Promise.all([
      window.api.modpacks.getMods(packAId.value),
      window.api.modpacks.getMods(packBId.value),
    ]);
    packAMods.value = modsA;
    packBMods.value = modsB;
  } catch (err) {
    console.error("Failed to load mods:", err);
  } finally {
    isLoading.value = false;
  }
}

async function copyToB(modId: string) {
  if (!packBId.value || !areCompatible.value) return;
  if (packB.value?.remote_source?.url) return; // Block if linked

  isCopying.value = true;
  try {
    await window.api.modpacks.addMod(packBId.value, modId);
    await loadComparison();
    const mod = packAMods.value.find(m => m.id === modId);
    toast.success("Mod Copied", `${mod?.name || 'Mod'} added to ${packBName.value}`);
  } catch (err: any) {
    toast.error("Copy Failed", err.message);
  } finally {
    isCopying.value = false;
  }
}

async function copyToA(modId: string) {
  if (!packAId.value || !areCompatible.value) return;
  if (packA.value?.remote_source?.url) return; // Block if linked

  isCopying.value = true;
  try {
    await window.api.modpacks.addMod(packAId.value, modId);
    await loadComparison();
    const mod = packBMods.value.find(m => m.id === modId);
    toast.success("Mod Copied", `${mod?.name || 'Mod'} added to ${packAName.value}`);
  } catch (err: any) {
    toast.error("Copy Failed", err.message);
  } finally {
    isCopying.value = false;
  }
}

async function copyAllToB() {
  if (!packBId.value || !areCompatible.value) return;
  if (packB.value?.remote_source?.url) return; // Block if linked

  isCopying.value = true;
  try {
    for (const mod of onlyInA.value) {
      await window.api.modpacks.addMod(packBId.value, mod.id!);
    }
    const count = onlyInA.value.length;
    await loadComparison();
    toast.success("Mods Copied", `${count} mods added to ${packBName.value}`);
  } catch (err: any) {
    toast.error("Copy Failed", err.message);
  } finally {
    isCopying.value = false;
  }
}

async function copyAllToA() {
  if (!packAId.value || !areCompatible.value) return;
  if (packA.value?.remote_source?.url) return; // Block if linked

  isCopying.value = true;
  try {
    for (const mod of onlyInB.value) {
      await window.api.modpacks.addMod(packAId.value, mod.id!);
    }
    const count = onlyInB.value.length;
    await loadComparison();
    toast.success("Mods Copied", `${count} mods added to ${packAName.value}`);
  } catch (err: any) {
    toast.error("Copy Failed", err.message);
  } finally {
    isCopying.value = false;
  }
}

// Sync Both Ways - merge both packs
async function syncBothWays() {
  if (!packAId.value || !packBId.value || !areCompatible.value) return;
  if (packA.value?.remote_source?.url || packB.value?.remote_source?.url) {
    toast.error("Cannot Sync", "One or both packs are linked to a remote source");
    return;
  }

  isSyncing.value = true;
  try {
    let addedToA = 0;
    let addedToB = 0;

    // Copy mods from B to A
    for (const mod of onlyInB.value) {
      await window.api.modpacks.addMod(packAId.value, mod.id!);
      addedToA++;
    }

    // Copy mods from A to B
    for (const mod of onlyInA.value) {
      await window.api.modpacks.addMod(packBId.value, mod.id!);
      addedToB++;
    }

    await loadComparison();
    toast.success("Sync Complete", `Added ${addedToA} mods to ${packAName.value}, ${addedToB} mods to ${packBName.value}`);
  } catch (err: any) {
    toast.error("Sync Failed", err.message);
  } finally {
    isSyncing.value = false;
  }
}

// Make pack B identical to pack A
async function makeIdentical(direction: 'AtoB' | 'BtoA') {
  if (!packAId.value || !packBId.value || !areCompatible.value) return;

  const targetId = direction === 'AtoB' ? packBId.value : packAId.value;
  const targetPack = direction === 'AtoB' ? packB.value : packA.value;
  const targetName = direction === 'AtoB' ? packBName.value : packAName.value;
  const sourceName = direction === 'AtoB' ? packAName.value : packBName.value;
  const modsToAdd = direction === 'AtoB' ? onlyInA.value : onlyInB.value;
  const modsToRemove = direction === 'AtoB' ? onlyInB.value : onlyInA.value;

  if (targetPack?.remote_source?.url) {
    toast.error("Cannot Modify", `${targetName} is linked to a remote source`);
    return;
  }

  isSyncing.value = true;
  try {
    let added = 0;
    let removed = 0;

    // Add missing mods
    for (const mod of modsToAdd) {
      await window.api.modpacks.addMod(targetId, mod.id!);
      added++;
    }

    // Remove extra mods
    for (const mod of modsToRemove) {
      await window.api.modpacks.removeMod(targetId, mod.id!);
      removed++;
    }

    await loadComparison();
    toast.success("Sync Complete", `${targetName} is now identical to ${sourceName} (+${added}, -${removed} mods)`);
  } catch (err: any) {
    toast.error("Sync Failed", err.message);
  } finally {
    isSyncing.value = false;
  }
}

// Update version in target pack (projectId is version-independent, modId is the actual mod to copy)
async function updateVersion(projectId: string, sourceModId: string, direction: 'AtoB' | 'BtoA') {
  if (!packAId.value || !packBId.value) return;

  const targetId = direction === 'AtoB' ? packBId.value : packAId.value;
  const targetPack = direction === 'AtoB' ? packB.value : packA.value;
  const targetMods = direction === 'AtoB' ? packBMods.value : packAMods.value;
  const sourceMods = direction === 'AtoB' ? packAMods.value : packBMods.value;
  const targetName = direction === 'AtoB' ? packBName.value : packAName.value;

  if (targetPack?.remote_source?.url) {
    toast.error("Cannot Update", `${targetName} is linked to a remote source`);
    return;
  }

  const sourceMod = sourceMods.find(m => m.id === sourceModId);
  if (!sourceMod) return;

  // Find the old version in target to remove
  const targetMod = targetMods.find(m => getProjectId(m) === projectId);
  if (!targetMod) return;

  isCopying.value = true;
  try {
    // Remove old version from target, add new version from source
    await window.api.modpacks.removeMod(targetId, targetMod.id);
    await window.api.modpacks.addMod(targetId, sourceModId);
    await loadComparison();
    toast.success("Version Updated", `${sourceMod.name} updated in ${targetName}`);
  } catch (err: any) {
    toast.error("Update Failed", err.message);
  } finally {
    isCopying.value = false;
  }
}

// Export diff report
async function exportDiffReport() {
  if (!packA.value || !packB.value) return;

  const now = new Date().toISOString().split('T')[0];
  const filename = `compare-${packA.value.name}-vs-${packB.value.name}-${now}.md`;

  let report = `# Modpack Comparison Report\n\n`;
  report += `**Date:** ${new Date().toLocaleDateString()}\n\n`;
  report += `## Packs Compared\n\n`;
  report += `| Pack | Minecraft | Loader | Total Mods |\n`;
  report += `|------|-----------|--------|------------|\n`;
  report += `| ${packA.value.name} | ${packA.value.minecraft_version} | ${packA.value.loader} | ${stats.value.totalA} |\n`;
  report += `| ${packB.value.name} | ${packB.value.minecraft_version} | ${packB.value.loader} | ${stats.value.totalB} |\n\n`;

  report += `## Summary\n\n`;
  report += `- **Only in ${packA.value.name}:** ${stats.value.onlyInA} mods\n`;
  report += `- **Only in ${packB.value.name}:** ${stats.value.onlyInB} mods\n`;
  report += `- **Common mods:** ${stats.value.common}\n`;
  report += `- **Version differences:** ${stats.value.versionDiffs}\n\n`;

  if (onlyInA.value.length > 0) {
    report += `## Only in ${packA.value.name}\n\n`;
    for (const mod of onlyInA.value) {
      report += `- ${mod.name}${mod.version ? ` (${mod.version})` : ''}\n`;
    }
    report += '\n';
  }

  if (onlyInB.value.length > 0) {
    report += `## Only in ${packB.value.name}\n\n`;
    for (const mod of onlyInB.value) {
      report += `- ${mod.name}${mod.version ? ` (${mod.version})` : ''}\n`;
    }
    report += '\n';
  }

  if (versionDiffs.value.length > 0) {
    report += `## Version Differences\n\n`;
    report += `| Mod | ${packA.value.name} | ${packB.value.name} |\n`;
    report += `|-----|-----|-----|\n`;
    for (const diff of versionDiffs.value) {
      report += `| ${diff.name} | ${diff.modA.version || 'N/A'} | ${diff.modB.version || 'N/A'} |\n`;
    }
    report += '\n';
  }

  if (common.value.length > 0) {
    report += `## Common Mods (${common.value.length})\n\n`;
    for (const mod of common.value) {
      report += `- ${mod.name}\n`;
    }
  }

  // Save file
  try {
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report Exported", filename);
  } catch (err: any) {
    toast.error("Export Failed", err.message);
  }
}

// Swap packs
function swapPacks() {
  const tempA = packAId.value;
  packAId.value = packBId.value;
  packBId.value = tempA;
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      // Clear mods first
      packAMods.value = [];
      packBMods.value = [];

      try {
        await loadModpacks();
        // Auto-select if pre-selected packs are provided
        if (props.preSelectedPackA) {
          packAId.value = props.preSelectedPackA;
        }
        if (props.preSelectedPackB) {
          packBId.value = props.preSelectedPackB;
        }
        // If no pre-selection, reset to null
        if (!props.preSelectedPackA && !props.preSelectedPackB) {
          packAId.value = null;
          packBId.value = null;
        }

        // Explicitly load comparison if both packs are set
        // (watcher won't fire if IDs are same as before)
        if (packAId.value && packBId.value) {
          await loadComparison();
        }
      } catch (err) {
        console.error("Failed to load modpacks for comparison:", err);
        toast.error("Load Failed", "Could not load modpacks for comparison");
      }
    }
  }
);

watch([packAId, packBId], () => {
  if (packAId.value && packBId.value) {
    loadComparison();
  }
});

const packAName = computed(
  () => modpacks.value.find((p) => p.id === packAId.value)?.name || "Pack A"
);
const packBName = computed(
  () => modpacks.value.find((p) => p.id === packBId.value)?.name || "Pack B"
);
</script>

<template>
  <Dialog :open="open" @close="emit('close')" maxWidth="6xl"
    contentClass="p-0 max-h-[85vh] flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="px-5 py-4 border-b border-border/50 flex items-center gap-3 shrink-0">
      <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
        <ArrowLeftRight class="w-5 h-5 text-primary" />
      </div>
      <div class="flex-1 min-w-0">
        <h2 class="text-base font-semibold">Compare Modpacks</h2>
        <p class="text-xs text-muted-foreground">
          Analyze differences and transfer mods between packs
        </p>
      </div>
      <!-- Header Actions -->
      <div class="flex items-center gap-2">
        <Button v-if="packAId && packBId" variant="outline" size="sm" class="h-8 text-xs gap-1.5"
          @click="exportDiffReport">
          <FileDown class="w-3.5 h-3.5" />
          Export Report
        </Button>
      </div>
    </div>

    <!-- Comparison Controls -->
    <div
      class="px-5 py-4 border-b border-border/50 bg-muted/10 grid grid-cols-[1fr_auto_1fr] gap-4 items-start shrink-0">
      <!-- Pack A Selector -->
      <div class="space-y-2">
        <label class="text-xs font-medium text-muted-foreground">Source Pack (A)</label>
        <div class="relative">
          <select v-model="packAId"
            class="w-full h-10 pl-3 pr-8 rounded-lg border border-border/50 bg-background text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary/50 appearance-none truncate transition-colors">
            <option :value="null" disabled class="bg-popover text-popover-foreground">
              Select modpack...
            </option>
            <option v-for="pack in modpacks" :key="pack.id" :value="pack.id" :disabled="pack.id === packBId"
              class="bg-popover text-popover-foreground">
              {{ pack.name }}
            </option>
          </select>
          <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" />
        </div>
        <div v-if="packA" class="flex items-center gap-2">
          <span class="text-xs bg-secondary px-1.5 py-0.5 rounded font-medium">{{ packA.minecraft_version }}</span>
          <span class="text-xs bg-secondary px-1.5 py-0.5 rounded capitalize">{{ packA.loader }}</span>
          <span class="text-xs text-muted-foreground">{{ packAMods.length }} mods</span>
        </div>
      </div>

      <!-- Swap Button -->
      <div class="pt-8 px-2">
        <button @click="swapPacks" :disabled="!packAId || !packBId"
          class="w-10 h-10 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Swap packs">
          <ArrowUpDown class="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <!-- Pack B Selector -->
      <div class="space-y-2">
        <label class="text-xs font-medium text-muted-foreground">Target Pack (B)</label>
        <div class="relative">
          <select v-model="packBId"
            class="w-full h-10 pl-3 pr-8 rounded-lg border border-border/50 bg-background text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary/50 appearance-none truncate transition-colors">
            <option :value="null" disabled class="bg-popover text-popover-foreground">
              Select modpack...
            </option>
            <option v-for="pack in modpacks" :key="pack.id" :value="pack.id" :disabled="pack.id === packAId"
              class="bg-popover text-popover-foreground">
              {{ pack.name }}
            </option>
          </select>
          <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" />
        </div>
        <div v-if="packB" class="flex items-center gap-2 justify-end">
          <span class="text-xs text-muted-foreground">{{ packBMods.length }} mods</span>
          <span class="text-xs bg-secondary px-1.5 py-0.5 rounded font-medium">{{ packB.minecraft_version }}</span>
          <span class="text-xs bg-secondary px-1.5 py-0.5 rounded capitalize">{{ packB.loader }}</span>
        </div>
      </div>
    </div>

    <!-- Action Toolbar (when packs selected) -->
    <div v-if="packAId && packBId && areCompatible"
      class="px-5 py-2 border-b border-border/50 bg-muted/5 flex items-center gap-3 shrink-0">
      <!-- View Tabs -->
      <div class="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg">
        <button @click="activeView = 'differences'" class="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
          :class="activeView === 'differences' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'">
          Differences
        </button>
        <button @click="activeView = 'versions'"
          class="px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5"
          :class="activeView === 'versions' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'">
          Version Diff
          <span v-if="versionDiffs.length > 0"
            class="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-600">
            {{ versionDiffs.length }}
          </span>
        </button>
      </div>

      <div class="flex-1" />

      <!-- Sync Actions -->
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="h-7 text-xs gap-1.5"
          :disabled="isSyncing || (onlyInA.length === 0 && onlyInB.length === 0) || !!packA?.remote_source?.url || !!packB?.remote_source?.url"
          @click="syncBothWays" title="Add unique mods from each pack to the other">
          <Merge class="w-3.5 h-3.5" />
          Sync Both Ways
        </Button>
        <div class="relative group">
          <Button variant="outline" size="sm" class="h-7 text-xs gap-1.5"
            :disabled="isSyncing || (onlyInA.length === 0 && onlyInB.length === 0)">
            <Copy class="w-3.5 h-3.5" />
            Make Identical
            <ChevronDown class="w-3 h-3" />
          </Button>
          <!-- Dropdown -->
          <div
            class="absolute top-full right-0 mt-1 w-56 bg-popover border border-border rounded-lg shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
            <button @click="makeIdentical('AtoB')" :disabled="!!packB?.remote_source?.url || isSyncing"
              class="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-t-lg">
              <ArrowRight class="w-4 h-4" />
              <span>Make <strong class="text-primary">{{ packBName }}</strong> identical to A</span>
            </button>
            <button @click="makeIdentical('BtoA')" :disabled="!!packA?.remote_source?.url || isSyncing"
              class="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-b-lg">
              <ArrowRight class="w-4 h-4 rotate-180" />
              <span>Make <strong class="text-primary">{{ packAName }}</strong> identical to B</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Incompatibility Warning -->
    <div v-if="packAId && packBId && !areCompatible"
      class="px-5 py-3 border-b border-amber-500/30 bg-amber-500/10 shrink-0">
      <div class="flex items-center gap-3 text-sm text-amber-600 dark:text-amber-400">
        <div class="p-1.5 rounded-lg bg-amber-500/20">
          <AlertTriangle class="w-4 h-4" />
        </div>
        <div class="flex-1">
          <span class="font-medium">Incompatible modpacks.</span>
          <span class="opacity-80"> Different Minecraft versions or mod loaders. Mod transfer is disabled.</span>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center min-h-[300px]">
      <div class="flex flex-col items-center gap-3">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p class="text-sm text-muted-foreground">Loading mods...</p>
      </div>
    </div>

    <!-- Comparison Columns (Differences View) -->
    <div v-else-if="packAId && packBId && activeView === 'differences'"
      class="flex-1 flex overflow-hidden min-h-[300px]">
      <!-- Unique to A -->
      <div class="flex-1 flex flex-col border-r border-border/30 min-w-0">
        <div class="p-3 border-b border-border/30 bg-amber-500/5 flex items-center justify-between shrink-0">
          <span class="text-sm font-medium flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-amber-500"></span>
            Only in {{ packAName }} ({{ onlyInA.length }})
          </span>
          <Button v-if="onlyInA.length > 0" variant="outline" size="sm"
            class="h-7 text-xs gap-1.5 hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/50"
            :disabled="!areCompatible || !!packB?.remote_source?.url || isCopying" @click="copyAllToB">
            <Lock v-if="packB?.remote_source?.url" class="w-3 h-3" />
            <template v-else>
              <Copy class="w-3 h-3" />
              Copy All
              <ArrowRight class="w-3 h-3" />
            </template>
          </Button>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <div v-if="onlyInA.length === 0"
            class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
            <Check class="w-8 h-8 mb-2 text-green-500/50" />
            <p>No unique mods</p>
            <p class="text-xs opacity-70">All mods are shared</p>
          </div>
          <div v-for="mod in onlyInA" :key="mod.id"
            class="group flex items-center justify-between p-2.5 rounded-lg border border-transparent hover:border-amber-500/30 hover:bg-amber-500/5 transition-all text-sm">
            <div class="min-w-0 pr-3 flex items-center gap-2">
              <Package class="w-4 h-4 text-muted-foreground shrink-0" />
              <div class="min-w-0">
                <div class="font-medium truncate">{{ mod.name }}</div>
                <div v-if="mod.version" class="text-xs text-muted-foreground truncate opacity-70">{{ mod.version }}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon"
              class="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0 hover:bg-amber-500/20 hover:text-amber-600"
              :disabled="!areCompatible || !!packB?.remote_source?.url || isCopying"
              :title="packB?.remote_source?.url ? 'Target pack is read-only' : areCompatible ? 'Copy to Pack B' : 'Incompatible'"
              @click="copyToB(mod.id)">
              <Lock v-if="packB?.remote_source?.url" class="w-3.5 h-3.5 text-muted-foreground" />
              <ArrowRight v-else class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Common -->
      <div class="w-[26%] flex flex-col border-r border-border/30 min-w-0 bg-muted/5">
        <div class="p-3 border-b border-border/30 bg-primary/5 shrink-0">
          <span class="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <span class="w-2 h-2 rounded-full bg-primary"></span>
            Common ({{ common.length }})
          </span>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <div v-if="common.length === 0"
            class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
            <Package class="w-8 h-8 mb-2 opacity-30" />
            <p>No common mods</p>
          </div>
          <div v-for="mod in common" :key="mod.id"
            class="p-2 rounded-lg bg-muted/30 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <div class="truncate font-medium">{{ mod.name }}</div>
          </div>
        </div>
      </div>

      <!-- Unique to B -->
      <div class="flex-1 flex flex-col min-w-0">
        <div class="p-3 border-b border-border/30 bg-primary/5 flex items-center justify-between shrink-0">
          <Button v-if="onlyInB.length > 0" variant="outline" size="sm"
            class="h-7 text-xs gap-1.5 hover:bg-primary/10 hover:text-primary hover:border-primary/50"
            :disabled="!areCompatible || !!packA?.remote_source?.url || isCopying" @click="copyAllToA">
            <Lock v-if="packA?.remote_source?.url" class="w-3 h-3" />
            <template v-else>
              <ArrowRight class="w-3 h-3 rotate-180" />
              Copy All
              <Copy class="w-3 h-3" />
            </template>
          </Button>
          <span v-else></span>
          <span class="text-sm font-medium flex items-center gap-2">
            Only in {{ packBName }} ({{ onlyInB.length }})
            <span class="w-2 h-2 rounded-full bg-primary"></span>
          </span>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <div v-if="onlyInB.length === 0"
            class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
            <Check class="w-8 h-8 mb-2 text-green-500/50" />
            <p>No unique mods</p>
            <p class="text-xs opacity-70">All mods are shared</p>
          </div>
          <div v-for="mod in onlyInB" :key="mod.id"
            class="group flex items-center justify-between p-2.5 rounded-lg border border-transparent hover:border-primary/30 hover:bg-primary/5 transition-all text-sm">
            <Button variant="ghost" size="icon"
              class="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0 hover:bg-primary/20 hover:text-primary"
              :disabled="!areCompatible || !!packA?.remote_source?.url || isCopying"
              :title="packA?.remote_source?.url ? 'Target pack is read-only' : areCompatible ? 'Copy to Pack A' : 'Incompatible'"
              @click="copyToA(mod.id)">
              <Lock v-if="packA?.remote_source?.url" class="w-3.5 h-3.5 text-muted-foreground" />
              <ArrowRight v-else class="w-3.5 h-3.5 rotate-180" />
            </Button>
            <div class="min-w-0 pl-3 text-right flex items-center gap-2 justify-end">
              <div class="min-w-0">
                <div class="font-medium truncate">{{ mod.name }}</div>
                <div v-if="mod.version" class="text-xs text-muted-foreground truncate opacity-70">{{ mod.version }}
                </div>
              </div>
              <Package class="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Version Diff View -->
    <div v-else-if="packAId && packBId && activeView === 'versions'"
      class="flex-1 flex flex-col overflow-hidden min-h-[300px]">
      <!-- Header -->
      <div class="p-3 border-b border-border/30 bg-amber-500/5 flex items-center justify-between shrink-0">
        <span class="text-sm font-medium flex items-center gap-2">
          <RefreshCw class="w-4 h-4 text-amber-500" />
          Mods with Different Versions ({{ versionDiffs.length }})
        </span>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="versionDiffs.length === 0"
          class="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
          <Check class="w-12 h-12 mb-3 text-green-500/50" />
          <p class="font-medium">All versions match!</p>
          <p class="text-sm opacity-70 mt-1">Common mods have the same version in both packs</p>
        </div>

        <div v-else class="divide-y divide-border/30">
          <div v-for="diff in versionDiffs" :key="diff.modA.id" class="p-4 hover:bg-muted/20 transition-colors">
            <div class="flex items-center gap-4">
              <!-- Mod Info -->
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <Package class="w-5 h-5 text-muted-foreground shrink-0" />
                <div class="min-w-0">
                  <div class="font-medium truncate">{{ diff.name }}</div>
                </div>
              </div>

              <!-- Version A -->
              <div class="flex flex-col items-center gap-1 w-32">
                <span class="text-[10px] text-muted-foreground uppercase">{{ packAName }}</span>
                <span class="text-xs font-mono bg-amber-500/10 text-amber-600 px-2 py-1 rounded truncate max-w-full"
                  :title="diff.modA.version">
                  {{ diff.modA.version || 'N/A' }}
                </span>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1">
                <Button variant="ghost" size="icon" class="h-7 w-7 hover:bg-primary/20 hover:text-primary"
                  :disabled="!!packB?.remote_source?.url || isCopying"
                  :title="`Use ${packAName}'s version in ${packBName}`"
                  @click="updateVersion(diff.projectId, diff.modA.id!, 'AtoB')">
                  <ArrowRight class="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" class="h-7 w-7 hover:bg-primary/20 hover:text-primary"
                  :disabled="!!packA?.remote_source?.url || isCopying"
                  :title="`Use ${packBName}'s version in ${packAName}`"
                  @click="updateVersion(diff.projectId, diff.modB.id!, 'BtoA')">
                  <ArrowRight class="w-3.5 h-3.5 rotate-180" />
                </Button>
              </div>

              <!-- Version B -->
              <div class="flex flex-col items-center gap-1 w-32">
                <span class="text-[10px] text-muted-foreground uppercase">{{ packBName }}</span>
                <span class="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded truncate max-w-full"
                  :title="diff.modB.version">
                  {{ diff.modB.version || 'N/A' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex-1 flex flex-col items-center justify-center text-muted-foreground py-16 min-h-[300px]">
      <div class="w-16 h-16 rounded-xl bg-muted/30 flex items-center justify-center mb-4">
        <ArrowLeftRight class="w-8 h-8 text-muted-foreground/40" />
      </div>
      <p class="font-medium">Select modpacks to compare</p>
      <p class="text-sm opacity-70 mt-1">Choose a source and target pack above</p>
    </div>

    <!-- Footer -->
    <div class="px-5 py-3 border-t border-border/50 flex justify-end shrink-0">
      <Button variant="outline" @click="emit('close')">Close</Button>
    </div>
  </Dialog>
</template>
