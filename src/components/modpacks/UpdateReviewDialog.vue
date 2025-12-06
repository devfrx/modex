<script setup lang="ts">
import { ref, computed } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import { ModpackChange } from "@/types";
import {
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Download,
} from "lucide-vue-next";

const props = defineProps<{
  open: boolean;
  modpackName: string;
  changes: ModpackChange[];
  newVersion?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "confirm"): void;
}>();

const isUpdating = ref(false);

const addedMods = computed(() => props.changes.filter((c) => c.type === "add"));
const removedMods = computed(() =>
  props.changes.filter((c) => c.type === "remove")
);
const updatedMods = computed(() =>
  props.changes.filter((c) => c.type === "update")
);
const enabledMods = computed(() =>
  props.changes.filter((c) => c.type === "enable")
);
const disabledMods = computed(() =>
  props.changes.filter((c) => c.type === "disable")
);

async function handleConfirm() {
  isUpdating.value = true;
  emit("confirm");
  // The parent component handles the actual update logic and closing
}
</script>

<template>
  <Dialog :open="open" title="Update Available" @close="$emit('close')">
    <div class="w-full max-w-lg mx-auto">
      <div class="p-4 bg-muted/30 rounded-lg border border-border/50 mb-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-lg">{{ modpackName }}</h3>
            <div class="text-sm text-muted-foreground flex items-center gap-2">
              <span>New Version Available</span>
              <span v-if="newVersion" class="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-mono">
                {{ newVersion }}
              </span>
            </div>
          </div>
          <Download class="w-8 h-8 text-primary/50" />
        </div>
      </div>

      <div class="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        <!-- added -->
        <div v-if="addedMods.length > 0">
          <h4 class="text-sm font-medium text-green-500 mb-2 flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Added Mods ({{ addedMods.length }})
          </h4>
          <div class="space-y-1">
            <div v-for="mod in addedMods" :key="mod.modId"
              class="p-2 rounded bg-green-500/5 border border-green-500/10 text-sm flex justify-between items-center gap-2 overflow-hidden">
              <span class="font-medium truncate min-w-0 flex-1">{{ mod.modName }}</span>
              <span class="text-xs text-green-600/70 shrink-0">{{
                mod.newVersion
              }}</span>
            </div>
          </div>
        </div>

        <!-- updated -->
        <div v-if="updatedMods.length > 0">
          <h4 class="text-sm font-medium text-blue-500 mb-2 flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Updated Mods ({{ updatedMods.length }})
          </h4>
          <div class="space-y-1">
            <div v-for="mod in updatedMods" :key="mod.modId"
              class="p-2 rounded bg-blue-500/5 border border-blue-500/10 text-sm flex justify-between items-center gap-2 overflow-hidden">
              <span class="font-medium truncate min-w-0 flex-1">{{ mod.modName }}</span>
              <div class="flex items-center gap-2 text-xs opacity-70 shrink-0">
                <span class="line-through truncate max-w-[100px]">{{ mod.previousVersion }}</span>
                <ArrowRight class="w-3 h-3 shrink-0" />
                <span class="text-blue-600 font-bold truncate max-w-[100px]">{{
                  mod.newVersion
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- removed -->
        <div v-if="removedMods.length > 0">
          <h4 class="text-sm font-medium text-red-500 mb-2 flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            Removed Mods ({{ removedMods.length }})
          </h4>
          <div class="space-y-1">
            <div v-for="mod in removedMods" :key="mod.modId"
              class="p-2 rounded bg-red-500/5 border border-red-500/10 text-sm flex justify-between items-center gap-2 overflow-hidden">
              <span class="font-medium decoration-red-500/50 line-through truncate min-w-0 flex-1">{{
                mod.modName
              }}</span>
            </div>
          </div>
        </div>

        <!-- enabled -->
        <div v-if="enabledMods.length > 0">
          <h4 class="text-sm font-medium text-emerald-500 mb-2 flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Enabled Mods ({{ enabledMods.length }})
          </h4>
          <div class="space-y-1">
            <div v-for="mod in enabledMods" :key="mod.modId"
              class="p-2 rounded bg-emerald-500/5 border border-emerald-500/10 text-sm flex justify-between items-center gap-2 overflow-hidden">
              <span class="font-medium truncate min-w-0 flex-1">{{ mod.modName }}</span>
              <span class="text-xs text-emerald-600/70 shrink-0">Re-enabled</span>
            </div>
          </div>
        </div>

        <!-- disabled -->
        <div v-if="disabledMods.length > 0">
          <h4 class="text-sm font-medium text-amber-500 mb-2 flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Disabled Mods ({{ disabledMods.length }})
          </h4>
          <div class="space-y-1">
            <div v-for="mod in disabledMods" :key="mod.modId"
              class="p-2 rounded bg-amber-500/5 border border-amber-500/10 text-sm flex justify-between items-center gap-2 overflow-hidden">
              <span class="font-medium truncate min-w-0 flex-1">{{ mod.modName }}</span>
              <span class="text-xs text-amber-600/70 shrink-0">Disabled</span>
            </div>
          </div>
        </div>

        <div v-if="changes.length === 0" class="text-center py-8 text-muted-foreground">
          <p>No changes detected in mod list.</p>
          <p class="text-xs">Only version/metadata update.</p>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-3 pt-4 border-t border-border/50">
        <Button variant="ghost" @click="$emit('close')">Cancel</Button>
        <Button @click="handleConfirm" :disabled="isUpdating">
          <RefreshCw v-if="isUpdating" class="w-4 h-4 mr-2 animate-spin" />
          {{ isUpdating ? "Updating..." : "Confirm Update" }}
        </Button>
      </div>
    </div>
  </Dialog>
</template>
