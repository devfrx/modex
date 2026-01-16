<script setup lang="ts">
import { ref, watch, computed } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Icon from "@/components/ui/Icon.vue";
import type { CFModLoader } from "@/types/electron";

const props = defineProps<{
  open: boolean;
  initialName?: string;
  initialModsCount?: number;
  // Forced values - when provided, these fields are locked
  forcedMinecraftVersion?: string;
  forcedLoader?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (
    e: "create",
    data: {
      name: string;
      version: string;
      minecraft_version: string;
      loader: string;
      loader_version?: string;
      description: string;
      image_path?: string;
    }
  ): void;
}>();

// Fetched Minecraft versions from CurseForge
const fetchedMinecraftVersions = ref<string[]>([]);
const isLoadingMinecraftVersions = ref(false);

// Fallback Minecraft versions (used if fetch fails)
const fallbackMinecraftVersions = [
  "1.21.4",
  "1.21.3",
  "1.21.1",
  "1.21",
  "1.20.6",
  "1.20.4",
  "1.20.2",
  "1.20.1",
  "1.20",
  "1.19.4",
  "1.19.3",
  "1.19.2",
  "1.19.1",
  "1.19",
  "1.18.2",
  "1.18.1",
  "1.18",
  "1.17.1",
  "1.17",
  "1.16.5",
  "1.16.4",
  "1.16.3",
  "1.16.2",
  "1.16.1",
  "1.12.2",
  "1.12.1",
  "1.12",
  "1.7.10",
];

// Computed for available MC versions - uses fetched or fallback
const minecraftVersions = computed(() => {
  const versions = fetchedMinecraftVersions.value.length > 0
    ? fetchedMinecraftVersions.value
    : fallbackMinecraftVersions;

  // Include forced version if it's not in the list
  if (props.forcedMinecraftVersion && !versions.includes(props.forcedMinecraftVersion)) {
    return [props.forcedMinecraftVersion, ...versions];
  }
  return versions;
});

// Fetch Minecraft versions from CurseForge
async function fetchMinecraftVersions() {
  if (!window.api || isLoadingMinecraftVersions.value) return;
  if (fetchedMinecraftVersions.value.length > 0) return; // Already fetched

  isLoadingMinecraftVersions.value = true;
  try {
    const versions = await window.api.curseforge.getMinecraftVersions();
    // Filter to only approved versions and extract version strings
    const approvedVersions = versions
      .filter((v: { approved: boolean }) => v.approved)
      .map((v: { versionString: string }) => v.versionString);
    fetchedMinecraftVersions.value = approvedVersions;
    console.log(`[CreateModpackDialog] Fetched ${approvedVersions.length} MC versions`);
  } catch (err) {
    console.error("[CreateModpackDialog] Failed to fetch MC versions:", err);
  } finally {
    isLoadingMinecraftVersions.value = false;
  }
}

const loaders = [
  { value: "forge", label: "Forge" },
  { value: "fabric", label: "Fabric" },
  { value: "neoforge", label: "NeoForge" },
  { value: "quilt", label: "Quilt" },
];

const form = ref({
  name: "",
  version: "1.0.0",
  minecraft_version: "1.20.1",
  loader: "forge",
  loader_version: "" as string | undefined,
  description: "",
  image_path: "" as string | undefined,
});

const nameError = ref("");
const availableLoaderVersions = ref<CFModLoader[]>([]);
const isLoadingLoaderVersions = ref(false);

// ModLoaderType enum from CurseForge API:
// 0 = Any, 1 = Forge, 2 = Cauldron, 3 = LiteLoader, 4 = Fabric, 5 = Quilt, 6 = NeoForge
const loaderTypeMap: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
};

// Filter loader versions by selected loader type using the numeric type field
// Fallback to name matching if type field is not reliable
const filteredLoaderVersions = computed(() => {
  const loaderType = form.value.loader.toLowerCase();
  const expectedType = loaderTypeMap[loaderType];

  if (expectedType === undefined) {
    return [];
  }

  // First try filtering by type field
  let filtered = availableLoaderVersions.value.filter((l) => l.type === expectedType);

  // Fallback: if no results with type, try matching by name pattern
  if (filtered.length === 0 && availableLoaderVersions.value.length > 0) {
    console.log(`[CreateModpackDialog] Type filter returned 0, falling back to name matching for "${loaderType}"`);
    filtered = availableLoaderVersions.value.filter((l) => {
      const name = l.name.toLowerCase();
      if (loaderType === "forge") {
        // Forge names: "forge-47.2.0" or "1.20.1-forge-47.2.0" (but NOT neoforge)
        return (name.startsWith("forge-") || name.includes("-forge-")) && !name.includes("neoforge");
      } else if (loaderType === "neoforge") {
        return name.startsWith("neoforge-") || name.includes("-neoforge-");
      } else if (loaderType === "fabric") {
        return name.startsWith("fabric-") || name.includes("-fabric-");
      } else if (loaderType === "quilt") {
        return name.startsWith("quilt-") || name.includes("-quilt-");
      }
      return false;
    });
  }

  return filtered;
});

// Extract clean version from loader name
// CurseForge naming patterns:
// - Forge: "forge-47.2.0" or "1.20.1-forge-47.2.0"
// - Fabric: "fabric-loader-0.16.9" or "fabric-0.16.9"
// - NeoForge: "neoforge-20.4.167"
// - Quilt: "quilt-loader-0.19.0" or "quilt-0.19.0"
function extractLoaderVersion(loaderName: string): string {
  // Try common patterns
  // Pattern: loader-X.X.X (e.g., "forge-47.2.0", "neoforge-20.4.167")
  let match = loaderName.match(/^(?:forge|neoforge|fabric|quilt)-(?:loader-)?(.+)$/i);
  if (match) return match[1];

  // Pattern: version-loader-version (e.g., "1.20.1-forge-47.2.0")
  match = loaderName.match(/^\d+\.\d+(?:\.\d+)?-(?:forge|neoforge|fabric|quilt)-(.+)$/i);
  if (match) return match[1];

  // Fallback: return as-is
  return loaderName;
}

// Computed props for locked fields
const isVersionLocked = computed(() => !!props.forcedMinecraftVersion);
const isLoaderLocked = computed(() => !!props.forcedLoader);

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

// Fetch loader versions when MC version or loader changes
async function fetchLoaderVersions() {
  if (!window.api) return;

  isLoadingLoaderVersions.value = true;
  try {
    const versions = await window.api.curseforge.getModLoaders(form.value.minecraft_version);
    console.log(`[CreateModpackDialog] Received ${versions.length} loader versions for MC ${form.value.minecraft_version}`);
    if (versions.length > 0) {
      console.log(`[CreateModpackDialog] Sample loader:`, versions[0]);
    }
    availableLoaderVersions.value = versions;

    // Auto-select recommended version if available
    const loaderType = form.value.loader.toLowerCase();
    const expectedType = loaderTypeMap[loaderType];
    const filtered = filteredLoaderVersions.value;
    console.log(`[CreateModpackDialog] Loader: ${loaderType}, expectedType: ${expectedType}, filtered count: ${filtered.length}`);

    // Find recommended or latest
    const recommended = filtered.find((l) => l.recommended);
    if (recommended) {
      form.value.loader_version = extractLoaderVersion(recommended.name);
    } else if (filtered.length > 0) {
      // Sort by date and pick latest
      const sorted = [...filtered].sort(
        (a, b) => new Date(b.dateModified).getTime() - new Date(a.dateModified).getTime()
      );
      form.value.loader_version = extractLoaderVersion(sorted[0].name);
    } else {
      form.value.loader_version = undefined;
    }
  } catch (err) {
    console.error("Failed to fetch loader versions:", err);
    availableLoaderVersions.value = [];
    form.value.loader_version = undefined;
  } finally {
    isLoadingLoaderVersions.value = false;
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      form.value.name = props.initialName || "";
      form.value.version = "1.0.0";
      form.value.minecraft_version = props.forcedMinecraftVersion || "1.20.1";
      form.value.loader = props.forcedLoader || "forge";
      form.value.loader_version = undefined;
      form.value.description = "";
      form.value.image_path = undefined;
      nameError.value = "";

      // Fetch MC versions and loader versions
      await fetchMinecraftVersions();
      await fetchLoaderVersions();
    }
  }
);

// Re-fetch when MC version changes
watch(
  () => form.value.minecraft_version,
  () => {
    if (props.open) {
      fetchLoaderVersions();
    }
  }
);

// Re-filter when loader changes
watch(
  () => form.value.loader,
  () => {
    if (props.open && availableLoaderVersions.value.length > 0) {
      // Auto-select recommended version for new loader
      const filtered = filteredLoaderVersions.value;
      const recommended = filtered.find((l) => l.recommended);
      if (recommended) {
        form.value.loader_version = extractLoaderVersion(recommended.name);
      } else if (filtered.length > 0) {
        const sorted = [...filtered].sort(
          (a, b) => new Date(b.dateModified).getTime() - new Date(a.dateModified).getTime()
        );
        form.value.loader_version = extractLoaderVersion(sorted[0].name);
      } else {
        form.value.loader_version = undefined;
      }
    }
  }
);

async function selectImage() {
  if (!window.api) return;
  const imagePath = await window.api.dialogs.selectImage();
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
    name: form.value.name.trim(),
    loader_version: form.value.loader_version || undefined,
  });
}
</script>

<template>
  <Dialog :open="open" title="New Pack">
    <div class="space-y-4 py-4">
      <p v-if="initialModsCount" class="text-sm text-muted-foreground">
        Creating a modpack with {{ initialModsCount }} selected mods.
      </p>

      <!-- Image Picker -->
      <div class="space-y-2">
        <label class="text-sm font-medium">Cover <span
            class="text-muted-foreground font-normal">(optional)</span></label>
        <div v-if="!form.image_path"
          class="flex items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
          @click="selectImage">
          <div class="flex flex-col items-center text-muted-foreground">
            <Icon name="ImagePlus" class="w-6 h-6 mb-1" />
            <span class="text-xs">Click to select</span>
          </div>
        </div>
        <div v-else class="relative w-full h-24 rounded-lg overflow-hidden border">
          <img :src="'atom:///' + form.image_path.replace(/\\\\/g, '/')" class="w-full h-full object-cover" alt="" />
          <button
            class="absolute top-1 right-1 p-1 bg-background/80 rounded-full hover:bg-destructive hover:text-destructive-foreground transition-colors"
            @click="removeImage">
            <Icon name="X" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">Name</label>
        <Input v-model="form.name" placeholder="My First Pack" autofocus
          :class="nameError ? 'border-red-500 focus-visible:ring-red-500' : ''" @input="nameError = ''" />
        <p v-if="nameError" class="text-xs text-red-500">{{ nameError }}</p>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">Pack Version</label>
        <Input v-model="form.version" placeholder="1.0.0" />
        <p class="text-xs text-muted-foreground">Your version number, like 1.0</p>
      </div>

      <!-- Minecraft Version -->
      <div class="space-y-2">
        <label class="text-sm font-medium flex items-center gap-2">
          Minecraft Version
          <Icon v-if="isVersionLocked" name="Lock" class="w-3 h-3 text-muted-foreground" />
        </label>
        <select v-model="form.minecraft_version" :disabled="isVersionLocked"
          class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          <option v-for="v in minecraftVersions" :key="v" :value="v">
            {{ v }}
          </option>
        </select>
        <p v-if="isVersionLocked" class="text-xs text-muted-foreground">
          Locked to match selected mods
        </p>
      </div>

      <!-- Loader -->
      <div class="space-y-2">
        <label class="text-sm font-medium flex items-center gap-2">
          Loader
          <Icon v-if="isLoaderLocked" name="Lock" class="w-3 h-3 text-muted-foreground" />
        </label>
        <select v-model="form.loader" :disabled="isLoaderLocked"
          class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          <option v-for="l in loaders" :key="l.value" :value="l.value">
            {{ l.label }}
          </option>
        </select>
        <p v-if="isLoaderLocked" class="text-xs text-muted-foreground">
          Locked to match selected mods
        </p>
      </div>

      <!-- Loader Version -->
      <div class="space-y-2">
        <label class="text-sm font-medium flex items-center gap-2">
          {{loaders.find(l => l.value === form.loader)?.label || 'Loader'}} Version
          <Icon v-if="isLoadingLoaderVersions" name="Loader2" class="w-3 h-3 animate-spin text-muted-foreground" />
        </label>
        <select v-model="form.loader_version" :disabled="isLoadingLoaderVersions || filteredLoaderVersions.length === 0"
          class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          <option v-if="filteredLoaderVersions.length === 0" value="">
            {{ isLoadingLoaderVersions ? 'Loading...' : 'No versions available' }}
          </option>
          <option v-for="lv in filteredLoaderVersions" :key="lv.name" :value="extractLoaderVersion(lv.name)">
            {{ extractLoaderVersion(lv.name) }}{{ lv.recommended ? ' (Recommended)' : lv.latest ? ' (Latest)' : '' }}
          </option>
        </select>
        <p class="text-xs text-muted-foreground">
          Recommended: latest stable version
        </p>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">Description</label>
        <textarea v-model="form.description"
          class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Optional description..."></textarea>
      </div>
    </div>

    <template #footer>
      <Button variant="outline" @click="$emit('close')">Cancel</Button>
      <Button @click="create" :disabled="!form.name.trim()">Create Pack</Button>
    </template>
  </Dialog>
</template>
