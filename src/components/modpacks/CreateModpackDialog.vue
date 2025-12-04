<script setup lang="ts">
import { ref, watch } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import { ImagePlus, X } from "lucide-vue-next";

const props = defineProps<{
  open: boolean;
  initialName?: string;
  initialModsCount?: number;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (
    e: "create",
    data: {
      name: string;
      version: string;
      description: string;
      image_path?: string;
    }
  ): void;
}>();

const form = ref({
  name: "",
  version: "1.0.0",
  description: "",
  image_path: "" as string | undefined,
});

const nameError = ref("");

// Validate name - not empty or whitespace only
function validateName(): boolean {
  const trimmedName = form.value.name.trim();
  if (!trimmedName) {
    nameError.value = "Name cannot be empty";
    return false;
  }
  if (trimmedName.length < 2) {
    nameError.value = "Name must be at least 2 characters";
    return false;
  }
  // Check for invalid characters (filesystem safe)
  if (/[<>:"/\\|?*]/.test(trimmedName)) {
    nameError.value = "Name contains invalid characters";
    return false;
  }
  nameError.value = "";
  return true;
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      form.value.name = props.initialName || "";
      form.value.version = "1.0.0";
      form.value.description = "";
      form.value.image_path = undefined;
      nameError.value = "";
    }
  }
);

async function selectImage() {
  if (!window.api) return;
  const imagePath = await window.api.modpacks.selectImage();
  if (imagePath) {
    form.value.image_path = imagePath;
  }
}

function removeImage() {
  form.value.image_path = undefined;
}

function create() {
  if (!validateName()) return;
  emit("create", { 
    ...form.value, 
    name: form.value.name.trim() 
  });
}
</script>

<template>
  <Dialog :open="open" title="Create Modpack">
    <div class="space-y-4 py-4">
      <p v-if="initialModsCount" class="text-sm text-muted-foreground">
        Creating a modpack with {{ initialModsCount }} selected mods.
      </p>

      <!-- Image Picker -->
      <div class="space-y-2">
        <label class="text-sm font-medium">Cover Image (Optional)</label>
        <div
          v-if="!form.image_path"
          class="flex items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
          @click="selectImage"
        >
          <div class="flex flex-col items-center text-muted-foreground">
            <ImagePlus class="w-6 h-6 mb-1" />
            <span class="text-xs">Click to select</span>
          </div>
        </div>
        <div
          v-else
          class="relative w-full h-24 rounded-lg overflow-hidden border"
        >
          <img
            :src="'atom:///' + form.image_path.replace(/\\\\/g, '/')"
            class="w-full h-full object-cover"
            alt=""
          />
          <button
            class="absolute top-1 right-1 p-1 bg-background/80 rounded-full hover:bg-destructive hover:text-destructive-foreground transition-colors"
            @click="removeImage"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">Name</label>
        <Input 
          v-model="form.name" 
          placeholder="My Awesome Modpack" 
          autofocus 
          :class="{ 'border-red-500 focus-visible:ring-red-500': nameError }"
          @input="nameError = ''"
        />
        <p v-if="nameError" class="text-xs text-red-500">{{ nameError }}</p>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">Version</label>
        <Input v-model="form.version" placeholder="1.0.0" />
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">Description</label>
        <textarea
          v-model="form.description"
          class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Optional description..."
        ></textarea>
      </div>
    </div>

    <template #footer>
      <Button variant="outline" @click="$emit('close')">Cancel</Button>
      <Button @click="create" :disabled="!form.name.trim()">Create</Button>
    </template>
  </Dialog>
</template>
