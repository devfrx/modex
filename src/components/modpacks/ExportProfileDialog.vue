<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { createLogger } from "@/utils/logger";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Icon from "@/components/ui/Icon.vue";
import type { Modpack } from "@/types";

const log = createLogger("ExportProfileDialog");

const props = defineProps<{
    open: boolean;
    modpack: Modpack | null;
}>();

const emit = defineEmits<{
    (e: "close"): void;
    (e: "export", options: ExportOptions): void;
}>();

export interface ExportOptions {
    profileName: string;
    version: string;
    selectedFolders: string[];
    /** Specific paths that were deselected (relative paths) */
    excludedPaths: string[];
    includeRamRecommendation: boolean;
    ramRecommendation: number;
    /** If true, only include server-side mods (server/both/unknown environments) */
    serverModsOnly: boolean;
}

export interface FolderEntry {
    name: string;
    type: "folder" | "file";
    children?: FolderEntry[];
    isExpanded?: boolean;
    path: string;
    /** Whether the folder/file exists on disk */
    exists?: boolean;
}

// Form state
const profileName = ref("");
const version = ref("1.0.0");
const includeRamRecommendation = ref(false);
const ramRecommendation = ref(4096);
const maxRam = ref(16064);

// Folder selection
const folderTree = ref<FolderEntry[]>([]);
const selectedPaths = ref<Set<string>>(new Set());
const isLoading = ref(false);
const serverModsOnly = ref(false);

// Default folders to select (only existing ones will be selected)
const defaultSelectedFolders = [
    "config",
    "mods",
    "resourcepacks",
    "shaderpacks",
    "shaders",
    "datapacks",
    "scripts",
    "kubejs",
    "defaultconfigs",
    "options.txt"
];

// Folders that are hidden by default (internal use)
const hiddenFolders = [".fabric", ".curseclient", "snapshots"];

// Load folder tree when dialog opens
watch(() => props.open, async (isOpen) => {
    if (isOpen && props.modpack) {
        profileName.value = props.modpack.name;
        version.value = props.modpack.version || "1.0.0";
        serverModsOnly.value = false;
        await loadFolderTree();
    }
});

async function loadFolderTree() {
    if (!props.modpack || !window.api) return;

    isLoading.value = true;
    try {
        // Get overrides folder contents
        const overrides = await window.api.export.getOverridesTree(props.modpack.id);
        folderTree.value = overrides || [];

        // Pre-select default folders
        selectedPaths.value.clear();
        selectDefaultFolders(folderTree.value);

        log.debug("Loaded folder tree", { folders: folderTree.value.length });
    } catch (err) {
        log.error("Failed to load folder tree", { error: String(err) });
        folderTree.value = [];
    } finally {
        isLoading.value = false;
    }
}

function selectDefaultFolders(entries: FolderEntry[]) {
    for (const entry of entries) {
        // Only select if it exists and is in the default list
        if (entry.exists !== false && defaultSelectedFolders.includes(entry.name.toLowerCase())) {
            selectedPaths.value.add(entry.path);
            // Also select all children recursively
            if (entry.children) {
                selectAllChildren(entry.children);
            }
        }
        // Continue checking children for more default folders
        if (entry.children) {
            selectDefaultFolders(entry.children);
        }
    }
}

function isSelected(path: string): boolean {
    return selectedPaths.value.has(path);
}

function isPartiallySelected(entry: FolderEntry): boolean {
    if (!entry.children || entry.children.length === 0) return false;
    const childCount = entry.children.length;
    let selectedCount = 0;
    for (const child of entry.children) {
        if (selectedPaths.value.has(child.path)) selectedCount++;
    }
    return selectedCount > 0 && selectedCount < childCount;
}

function isModsFolder(entry: FolderEntry): boolean {
    return entry.name.toLowerCase() === 'mods' && entry.type === 'folder';
}

function isModsFolderLocked(entry: FolderEntry): boolean {
    return serverModsOnly.value && isModsFolder(entry);
}

function toggleSelection(entry: FolderEntry) {
    // Don't allow selection of non-existing items
    if (entry.exists === false) {
        return;
    }
    
    // Don't allow toggling mods folder when serverModsOnly is enabled
    if (isModsFolderLocked(entry)) {
        return;
    }

    if (selectedPaths.value.has(entry.path)) {
        // Deselect this and all children
        selectedPaths.value.delete(entry.path);
        if (entry.children) {
            deselectAllChildren(entry.children);
        }
    } else {
        // Select this
        selectedPaths.value.add(entry.path);
        // If folder, also select all children (only existing ones)
        if (entry.children) {
            selectAllExistingChildren(entry.children);
        }
    }
}

function selectAllExistingChildren(entries: FolderEntry[]) {
    for (const entry of entries) {
        if (entry.exists !== false) {
            selectedPaths.value.add(entry.path);
        }
        if (entry.children) {
            selectAllExistingChildren(entry.children);
        }
    }
}

function selectAllChildren(entries: FolderEntry[]) {
    for (const entry of entries) {
        selectedPaths.value.add(entry.path);
        if (entry.children) {
            selectAllChildren(entry.children);
        }
    }
}

function deselectAllChildren(entries: FolderEntry[]) {
    for (const entry of entries) {
        selectedPaths.value.delete(entry.path);
        if (entry.children) {
            deselectAllChildren(entry.children);
        }
    }
}

function toggleExpand(entry: FolderEntry) {
    entry.isExpanded = !entry.isExpanded;
}

function isHiddenFolder(name: string): boolean {
    return hiddenFolders.some(h => name.toLowerCase() === h.toLowerCase());
}

// Filter visible folders
const visibleFolders = computed(() => {
    return folderTree.value.filter(entry => !isHiddenFolder(entry.name));
});

function getIconForEntry(entry: FolderEntry): string {
    if (entry.type === "file") {
        const ext = entry.name.split(".").pop()?.toLowerCase();
        if (ext === "json") return "FileJson";
        if (ext === "txt") return "FileText";
        if (ext === "dat") return "Database";
        return "File";
    }

    const name = entry.name.toLowerCase();
    if (name === "config") return "Settings";
    if (name === "mods") return "Box";
    if (name === "resourcepacks") return "Image";
    if (name === "shaderpacks" || name === "shaders") return "Sparkles";
    if (name === "datapacks") return "Database";
    if (name === "saves") return "Save";
    if (name === "logs") return "FileText";
    if (name === "downloads") return "Download";
    if (name === "defaultconfigs") return "Settings";
    if (name === "scripts" || name === "kubejs") return "Code";
    if (name.startsWith(".")) return "FolderDot";
    return "Folder";
}

function hasWarning(entry: FolderEntry): boolean {
    return entry.name.startsWith(".");
}

function doesNotExist(entry: FolderEntry): boolean {
    return entry.exists === false;
}

function handleExport() {
    // Get only top-level selected folders (not nested ones)
    const selectedFolders = Array.from(selectedPaths.value)
        .filter(path => !path.includes("/") || folderTree.value.some(f => f.path === path));

    // Calculate excluded paths: all existing paths that are NOT selected
    const excludedPaths = collectExcludedPaths(folderTree.value);

    emit("export", {
        profileName: profileName.value,
        version: version.value,
        selectedFolders,
        excludedPaths,
        includeRamRecommendation: includeRamRecommendation.value,
        ramRecommendation: ramRecommendation.value,
        serverModsOnly: serverModsOnly.value,
    });
}

/**
 * Recursively collect paths that exist but are NOT selected
 */
function collectExcludedPaths(entries: FolderEntry[]): string[] {
    const excluded: string[] = [];

    for (const entry of entries) {
        // Skip non-existing entries
        if (entry.exists === false) continue;

        if (!selectedPaths.value.has(entry.path)) {
            // This path exists but is not selected - exclude it
            excluded.push(entry.path);
        } else if (entry.children && entry.children.length > 0) {
            // This folder is selected, but check children
            excluded.push(...collectExcludedPaths(entry.children));
        }
    }

    return excluded;
}

function handleClose() {
    emit("close");
}
</script>

<template>
    <Dialog :open="open" title="Export Profile" size="lg" @close="handleClose">
        <div class="space-y-5">
            <!-- Profile Name -->
            <div class="space-y-1.5">
                <label class="text-sm font-medium text-foreground">Profile Name</label>
                <Input v-model="profileName" placeholder="My Modpack" />
            </div>

            <!-- Package Version -->
            <div class="space-y-1.5">
                <label class="text-sm font-medium text-foreground">Package Version</label>
                <Input v-model="version" placeholder="1.0.0" />
            </div>

            <!-- RAM Recommendation -->
            <div class="space-y-3">
                <div class="flex items-center gap-2">
                    <button type="button" role="switch" :aria-checked="includeRamRecommendation"
                        class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        :class="includeRamRecommendation ? 'bg-primary' : 'bg-muted'"
                        @click="includeRamRecommendation = !includeRamRecommendation">
                        <span
                            class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform"
                            :class="includeRamRecommendation ? 'translate-x-4' : 'translate-x-0'" />
                    </button>
                    <label class="text-sm text-muted-foreground flex items-center gap-1.5">
                        Set RAM recommendation
                        <Icon name="HelpCircle" class="w-3.5 h-3.5 text-muted-foreground/60" />
                    </label>
                </div>

                <div v-if="includeRamRecommendation" class="space-y-2">
                    <input type="range" v-model.number="ramRecommendation" :min="1024" :max="maxRam" :step="512"
                        class="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary" />
                    <div class="flex justify-between text-micro text-muted-foreground">
                        <span>0</span>
                        <span>{{ maxRam }}</span>
                    </div>
                    <div class="flex justify-end">
                        <div class="px-3 py-1.5 bg-muted/50 rounded text-sm font-mono">
                            {{ ramRecommendation }}MB
                        </div>
                    </div>
                </div>
            </div>

            <!-- Folder Selection -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-foreground">Select files and folders to include in
                        package</label>
                </div>

                <!-- Server mods only toggle -->
                <div class="flex items-center gap-2 pb-2">
                    <button type="button" role="switch" :aria-checked="serverModsOnly"
                        class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        :class="serverModsOnly ? 'bg-primary' : 'bg-muted'" @click="serverModsOnly = !serverModsOnly">
                        <span
                            class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform"
                            :class="serverModsOnly ? 'translate-x-4' : 'translate-x-0'" />
                    </button>
                    <label class="text-sm text-muted-foreground flex items-center gap-1.5">
                        Export server-side mods only
                        <span class="text-xs text-muted-foreground/60">(server, both, unknown)</span>
                    </label>
                </div>

                <!-- Folder Tree -->
                <div v-if="isLoading" class="flex items-center justify-center py-8">
                    <Icon name="Loader2" class="w-5 h-5 animate-spin text-muted-foreground" />
                </div>

                <div v-else-if="visibleFolders.length === 0" class="py-8 text-center text-muted-foreground text-sm">
                    No overrides folders found for this modpack
                </div>

                <div v-else
                    class="border border-border/50 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto bg-muted/10">
                    <div class="divide-y divide-border/30">
                        <template v-for="entry in visibleFolders" :key="entry.path">
                            <!-- Parent folder -->
                            <div class="flex items-center gap-2 px-3 py-2 transition-colors" :class="[
                                doesNotExist(entry)
                                    ? 'opacity-40 cursor-not-allowed'
                                    : isModsFolderLocked(entry)
                                        ? 'opacity-60 cursor-not-allowed bg-primary/5'
                                        : 'hover:bg-muted/30 cursor-pointer'
                            ]" @click="toggleSelection(entry)">
                                <!-- Expand toggle -->
                                <button
                                    v-if="entry.type === 'folder' && entry.children && entry.children.length > 0 && !doesNotExist(entry)"
                                    class="p-0.5 hover:bg-muted rounded transition-colors"
                                    @click.stop="toggleExpand(entry)">
                                    <Icon :name="entry.isExpanded ? 'ChevronDown' : 'ChevronRight'"
                                        class="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                                <div v-else class="w-4.5" />

                                <!-- Checkbox -->
                                <div class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
                                    :class="doesNotExist(entry)
                                        ? 'border-border/50 bg-muted/30'
                                        : isSelected(entry.path)
                                            ? 'bg-primary border-primary'
                                            : isPartiallySelected(entry)
                                                ? 'bg-primary/50 border-primary'
                                                : 'border-border bg-background'">
                                    <Icon v-if="isSelected(entry.path)" name="Check"
                                        class="w-3 h-3 text-primary-foreground" />
                                    <Icon v-else-if="isPartiallySelected(entry)" name="Minus"
                                        class="w-3 h-3 text-primary-foreground" />
                                </div>

                                <!-- Folder icon and name -->
                                <Icon :name="getIconForEntry(entry)" class="w-4 h-4 text-muted-foreground" />
                                <span class="text-sm flex items-center gap-1.5" :class="[
                                    doesNotExist(entry) ? 'text-muted-foreground/50 italic' : '',
                                    isHiddenFolder(entry.name) ? 'text-muted-foreground/50' : 'text-foreground'
                                ]">
                                    {{ entry.name }}
                                    <span v-if="doesNotExist(entry)" class="text-xs text-muted-foreground/40">(not
                                        found)</span>
                                </span>
                                <Icon v-if="hasWarning(entry)" name="AlertTriangle" class="w-3.5 h-3.5 text-warning" />
                                <!-- Locked indicator for mods folder -->
                                <span v-if="isModsFolderLocked(entry)" class="ml-auto text-xs text-primary/80 flex items-center gap-1">
                                    <Icon name="Lock" class="w-3 h-3" />
                                    server filter active
                                </span>
                            </div>

                            <!-- Children (expanded) -->
                            <template v-if="entry.isExpanded && entry.children">
                                <div v-for="child in entry.children" :key="child.path"
                                    class="flex items-center gap-2 px-3 py-2 pl-10 transition-colors bg-muted/5"
                                    :class="isModsFolderLocked(entry) ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/30 cursor-pointer'"
                                    @click="!isModsFolderLocked(entry) && toggleSelection(child)">
                                    <!-- Spacer for alignment -->
                                    <div class="w-4.5" />

                                    <!-- Checkbox -->
                                    <div class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
                                        :class="isSelected(child.path)
                                            ? 'bg-primary border-primary'
                                            : 'border-border bg-background'">
                                        <Icon v-if="isSelected(child.path)" name="Check"
                                            class="w-3 h-3 text-primary-foreground" />
                                    </div>

                                    <!-- Icon and name -->
                                    <Icon :name="getIconForEntry(child)" class="w-4 h-4 text-muted-foreground" />
                                    <span class="text-sm text-foreground">{{ child.name }}</span>
                                </div>
                            </template>
                        </template>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <Button variant="ghost" @click="handleClose">Cancel</Button>
            <Button @click="handleExport" :disabled="!profileName.trim()">
                <Icon name="Download" class="w-4 h-4 mr-2" />
                Export
            </Button>
        </template>
    </Dialog>
</template>
