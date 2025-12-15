<script setup lang="ts">
import { ref, computed } from "vue";
import { Users, Plus, Trash2, RotateCcw, Save, Play } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import type { Modpack, ModpackProfile } from "@/types";

const props = defineProps<{
  modpack: Modpack;
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
}>();

const newProfileName = ref("");
const isCreating = ref(false);
const isDialogOpen = ref(false);

// Confirm dialog state
const showApplyConfirm = ref(false);
const showDeleteConfirm = ref(false);
const selectedProfile = ref<ModpackProfile | null>(null);

const sortedProfiles = computed(() => {
  if (!props.modpack.profiles) return [];
  return [...props.modpack.profiles].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
});

async function createProfile() {
  if (!newProfileName.value.trim()) return;

  isCreating.value = true;
  try {
    await window.api.modpacks.createProfile(
      props.modpack.id,
      newProfileName.value
    );
    newProfileName.value = "";
    isDialogOpen.value = false;
    emit("refresh");
  } catch (err) {
    console.error("Failed to create profile:", err);
  } finally {
    isCreating.value = false;
  }
}

async function applyProfile(profile: ModpackProfile) {
  selectedProfile.value = profile;
  showApplyConfirm.value = true;
}

async function confirmApplyProfile() {
  if (!selectedProfile.value) return;
  showApplyConfirm.value = false;

  try {
    await window.api.modpacks.applyProfile(props.modpack.id, selectedProfile.value.id);
    emit("refresh");
  } catch (err) {
    console.error("Failed to apply profile:", err);
  } finally {
    selectedProfile.value = null;
  }
}

async function deleteProfile(profile: ModpackProfile) {
  selectedProfile.value = profile;
  showDeleteConfirm.value = true;
}

async function confirmDeleteProfile() {
  if (!selectedProfile.value) return;
  showDeleteConfirm.value = false;

  try {
    await window.api.modpacks.deleteProfile(props.modpack.id, selectedProfile.value.id);
    emit("refresh");
  } catch (err) {
    console.error("Failed to delete profile:", err);
  } finally {
    selectedProfile.value = null;
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-medium flex items-center gap-2">
          <Users class="w-5 h-5" />
          Mod Profiles
        </h3>
        <p class="text-sm text-muted-foreground">
          Save and switch between different mod configurations
        </p>
      </div>

      <Button size="sm" class="gap-2" @click="isDialogOpen = true">
        <Plus class="w-4 h-4" />
        Save Current Profile
      </Button>

      <Dialog :open="isDialogOpen" title="Save Mod Profile"
        description="Create a new profile from the currently enabled mods." maxWidth="sm" @close="isDialogOpen = false">
        <div class="grid gap-4 py-4">
          <div class="grid gap-2">
            <Input id="name" v-model="newProfileName" placeholder="e.g. Performance Mode, RPG Setup..."
              @keyup.enter="createProfile" />
          </div>
        </div>
        <template #footer>
          <Button variant="ghost" @click="isDialogOpen = false">
            Cancel
          </Button>
          <Button @click="createProfile" :disabled="!newProfileName.trim() || isCreating">
            {{ isCreating ? "Saving..." : "Save Profile" }}
          </Button>
        </template>
      </Dialog>
    </div>

    <div v-if="sortedProfiles.length === 0"
      class="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
      <Users class="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p>No profiles saved yet.</p>
      <p class="text-xs">
        Configure your mods and click "Save Current Profile" to start.
      </p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div v-for="profile in sortedProfiles" :key="profile.id"
        class="border rounded-lg bg-card text-card-foreground shadow-sm transition-all hover:border-primary/50">
        <div class="p-4 pb-2">
          <div class="flex justify-between items-start">
            <div>
              <h3 class="font-semibold leading-none tracking-tight">
                {{ profile.name }}
              </h3>
              <p class="text-sm text-muted-foreground mt-1">
                {{ formatDate(profile.created_at) }}
              </p>
            </div>
            <div class="flex gap-1">
              <Button variant="ghost" size="icon"
                class="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                @click="deleteProfile(profile)" title="Delete Profile">
                <Trash2 class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        <div class="p-4 pt-2">
          <div class="flex items-center justify-between text-sm mb-4">
            <span class="text-muted-foreground">
              {{ profile.enabled_mod_ids.length }} mods enabled
            </span>
          </div>
          <Button class="w-full gap-2" variant="secondary" @click="applyProfile(profile)">
            <Play class="w-4 h-4" />
            Load Profile
          </Button>
        </div>
      </div>
    </div>

    <!-- Apply Profile Confirm Dialog -->
    <ConfirmDialog :open="showApplyConfirm" title="Apply Profile"
      :message="`Apply profile '${selectedProfile?.name}'? This will change which mods are enabled/disabled in this modpack.`"
      confirm-text="Apply Profile" cancel-text="Cancel" variant="info" icon="info"
      @close="showApplyConfirm = false; selectedProfile = null" @confirm="confirmApplyProfile" />

    <!-- Delete Profile Confirm Dialog -->
    <ConfirmDialog :open="showDeleteConfirm" title="Delete Profile"
      :message="`Delete profile '${selectedProfile?.name}'? This action cannot be undone.`" confirm-text="Delete"
      cancel-text="Cancel" variant="danger" icon="trash" @close="showDeleteConfirm = false; selectedProfile = null"
      @confirm="confirmDeleteProfile" />
  </div>
</template>
