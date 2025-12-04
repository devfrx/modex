<script setup lang="ts">
import { ref, watch } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import type { Mod } from "@/types/electron";

const props = defineProps<{
  open: boolean;
  mod: Mod;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", mod: Partial<Mod>): void;
}>();

const form = ref({
  name: "",
  version: "",
  description: "",
  author: "",
});

watch(
  () => props.mod,
  (newMod) => {
    form.value = {
      name: newMod.name,
      version: newMod.version,
      description: newMod.description || "",
      author: newMod.author || "",
    };
  },
  { immediate: true }
);

function save() {
  emit("save", {
    ...form.value,
  });
}
</script>

<template>
  <Dialog :open="open" title="Edit Mod Details">
    <div class="space-y-4 py-4">
      <div class="space-y-2">
        <label class="text-sm font-medium">Name</label>
        <Input v-model="form.name" placeholder="Mod Name" />
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">Version</label>
        <Input v-model="form.version" placeholder="1.0.0" />
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">Author</label>
        <Input v-model="form.author" placeholder="Author Name" />
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">Description</label>
        <textarea
          v-model="form.description"
          class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Mod description..."
        ></textarea>
      </div>
    </div>

    <template #footer>
      <Button variant="outline" @click="$emit('close')">Cancel</Button>
      <Button @click="save">Save Changes</Button>
    </template>
  </Dialog>
</template>
