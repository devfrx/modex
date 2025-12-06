<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import Input from "@/components/ui/Input.vue";
import { useDialog } from "@/composables/useDialog";
import { useToast } from "@/composables/useToast";
import type { ModpackVersion, ModpackVersionHistory, ModpackChange } from "@/types/electron";
import {
    GitBranch,
    GitCommit,
    Plus,
    Minus,
    RefreshCw,
    RotateCcw,
    ChevronDown,
    ChevronUp,
    Save,
    Clock,
    Sparkles,
    ToggleLeft,
    ToggleRight,
} from "lucide-vue-next";

const props = defineProps<{
    modpackId: string;
    modpackName: string;
}>();

const emit = defineEmits<{
    (e: "refresh"): void;
}>();

const toast = useToast();
const { confirm } = useDialog();

const history = ref<ModpackVersionHistory | null>(null);
const isLoading = ref(false);
const showCommitDialog = ref(false);
const commitMessage = ref("");
const commitTag = ref("");
const expandedVersions = ref<Set<string>>(new Set());

// Computed
const versions = computed(() => {
    if (!history.value) return [];
    return [...history.value.versions].reverse();
});

const currentVersionId = computed(() => history.value?.current_version_id);
const hasVersionControl = computed(() => history.value !== null && history.value.versions.length > 0);

// Load version history
async function loadHistory() {
    isLoading.value = true;
    try {
        history.value = await window.api.versions.getHistory(props.modpackId);
    } catch (err) {
        console.error("Failed to load version history:", err);
    } finally {
        isLoading.value = false;
    }
}

// Initialize version control
async function initializeVersionControl() {
    isLoading.value = true;
    try {
        const version = await window.api.versions.initialize(props.modpackId, "Initial version");
        if (version) {
            await loadHistory();
            toast.success("Version Control Enabled", "Created initial version v1");
        }
    } catch (err) {
        toast.error("Failed", (err as Error).message);
    } finally {
        isLoading.value = false;
    }
}

// Create new version
async function createVersion() {
    if (!commitMessage.value.trim()) {
        toast.error("Message Required", "Please enter a commit message");
        return;
    }

    isLoading.value = true;
    try {
        const version = await window.api.versions.create(
            props.modpackId,
            commitMessage.value.trim(),
            commitTag.value.trim() || undefined
        );

        if (version) {
            await loadHistory();
            toast.success("Version Created", `Created version ${version.tag}`);
            showCommitDialog.value = false;
            commitMessage.value = "";
            commitTag.value = "";
            emit("refresh");
        } else {
            toast.info("No Changes", "No changes detected since last version");
            showCommitDialog.value = false;
        }
    } catch (err) {
        toast.error("Failed", (err as Error).message);
    } finally {
        isLoading.value = false;
    }
}

// Rollback to version
async function rollbackTo(version: ModpackVersion) {
    const confirmed = await confirm({
        title: "Rollback to Version",
        message: `Restore modpack to version ${version.tag}? A rollback commit will be created.`,
        variant: "warning",
        icon: "warning",
        confirmText: "Rollback",
        cancelText: "Cancel"
    });

    if (!confirmed) return;

    isLoading.value = true;
    try {
        const result = await window.api.versions.rollback(props.modpackId, version.id);
        
        // Handle new detailed response format
        if (typeof result === 'object' && result !== null) {
            if (result.success) {
                await loadHistory();
                
                // Show appropriate message based on restoration status
                if (result.failedCount > 0) {
                    const failedNames = result.failedMods?.map((f: any) => f.modName).slice(0, 3).join(', ');
                    const moreCount = result.failedCount > 3 ? ` and ${result.failedCount - 3} more` : '';
                    toast.warning(
                        "Partial Rollback", 
                        `Restored ${result.totalMods} of ${result.originalModCount} mods. Failed: ${failedNames}${moreCount}`
                    );
                } else if (result.restoredCount > 0) {
                    toast.success(
                        "Rolled Back", 
                        `Restored to ${version.tag} (${result.restoredCount} mod${result.restoredCount > 1 ? 's' : ''} re-downloaded)`
                    );
                } else {
                    toast.success("Rolled Back", `Restored to version ${version.tag}`);
                }
                emit("refresh");
            } else {
                toast.error("Failed", "Could not rollback to this version");
            }
        } else if (result) {
            // Legacy boolean response
            await loadHistory();
            toast.success("Rolled Back", `Restored to version ${version.tag}`);
            emit("refresh");
        } else {
            toast.error("Failed", "Could not rollback to this version");
        }
    } catch (err) {
        toast.error("Failed", (err as Error).message);
    } finally {
        isLoading.value = false;
    }
}

// Toggle version expansion
function toggleExpanded(versionId: string) {
    if (expandedVersions.value.has(versionId)) {
        expandedVersions.value.delete(versionId);
    } else {
        expandedVersions.value.add(versionId);
    }
}

// Format date
function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    }

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
}

// Get change icon
function getChangeIcon(type: ModpackChange["type"]) {
    switch (type) {
        case "add": return Plus;
        case "remove": return Minus;
        case "update": return RefreshCw;
        case "enable": return ToggleRight;
        case "disable": return ToggleLeft;
    }
}

// Get change color class
function getChangeColor(type: ModpackChange["type"]): string {
    switch (type) {
        case "add": return "text-emerald-500 bg-emerald-500/10";
        case "remove": return "text-red-500 bg-red-500/10";
        case "update": return "text-blue-500 bg-blue-500/10";
        case "enable": return "text-emerald-500 bg-emerald-500/10";
        case "disable": return "text-amber-500 bg-amber-500/10";
    }
}

// Watch for modpack changes
watch(() => props.modpackId, () => {
    loadHistory();
}, { immediate: true });
</script>

<template>
    <div class="h-full flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <GitBranch class="w-5 h-5 text-primary" />
                    <h3 class="text-lg font-semibold">Version History</h3>
                </div>
                <p class="text-sm text-muted-foreground">
                    Track changes and rollback to previous states
                </p>
            </div>

            <Button v-if="hasVersionControl" size="sm" class="gap-1.5" @click="showCommitDialog = true"
                :disabled="isLoading">
                <Save class="w-4 h-4" />
                Save Version
            </Button>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading && !history" class="flex-1 flex items-center justify-center">
            <div class="text-center">
                <div
                    class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3">
                </div>
                <p class="text-sm text-muted-foreground">Loading history...</p>
            </div>
        </div>

        <!-- No Version Control -->
        <div v-else-if="!hasVersionControl" class="flex-1 flex items-center justify-center">
            <div class="text-center max-w-sm">
                <div class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles class="w-8 h-8 text-primary" />
                </div>
                <h4 class="font-semibold mb-2">Enable Version Control</h4>
                <p class="text-sm text-muted-foreground mb-4">
                    Track changes to your modpack and restore previous versions anytime
                </p>
                <Button @click="initializeVersionControl" :disabled="isLoading" class="gap-1.5">
                    <GitBranch class="w-4 h-4" />
                    Enable Now
                </Button>
            </div>
        </div>

        <!-- Version Timeline -->
        <div v-else class="flex-1 overflow-y-auto -mx-2 px-2">
            <div class="relative">
                <!-- Timeline Line -->
                <div class="absolute left-[15px] top-4 bottom-4 w-px bg-border/50"></div>

                <!-- Version Items -->
                <div class="space-y-3">
                    <div v-for="(version, index) in versions" :key="version.id" class="relative">
                        <!-- Timeline Dot -->
                        <div class="absolute left-0 top-3 w-[31px] flex justify-center z-10">
                            <div class="w-3 h-3 rounded-full border-2 transition-colors" :class="version.id === currentVersionId
                                ? 'bg-primary border-primary'
                                : 'bg-background border-border'">
                            </div>
                        </div>

                        <!-- Version Card -->
                        <div class="ml-10 rounded-xl border transition-all overflow-hidden" :class="version.id === currentVersionId
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-border/50 hover:border-border'">

                            <!-- Header -->
                            <div class="flex items-center gap-3 p-3 cursor-pointer" @click="toggleExpanded(version.id)">
                                <GitCommit class="w-4 h-4 text-muted-foreground shrink-0" />

                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="font-mono text-sm font-semibold">{{ version.tag }}</span>
                                        <span v-if="version.id === currentVersionId"
                                            class="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium uppercase tracking-wide">
                                            Current
                                        </span>
                                        <span v-if="index === 0 && version.id !== currentVersionId"
                                            class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 font-medium uppercase tracking-wide">
                                            Latest
                                        </span>
                                    </div>
                                    <p class="text-sm text-muted-foreground truncate mt-0.5">{{ version.message }}</p>
                                </div>

                                <div class="flex items-center gap-2 shrink-0">
                                    <span class="text-xs text-muted-foreground whitespace-nowrap">
                                        {{ formatDate(version.created_at) }}
                                    </span>

                                    <Button v-if="version.id !== currentVersionId" size="sm" variant="ghost"
                                        class="h-7 w-7 p-0" @click.stop="rollbackTo(version)"
                                        title="Rollback to this version">
                                        <RotateCcw class="w-3.5 h-3.5" />
                                    </Button>

                                    <component :is="expandedVersions.has(version.id) ? ChevronUp : ChevronDown"
                                        class="w-4 h-4 text-muted-foreground" />
                                </div>
                            </div>

                            <!-- Expanded Details -->
                            <Transition name="expand">
                                <div v-if="expandedVersions.has(version.id)"
                                    class="border-t border-border/30 bg-muted/20 p-3 space-y-3">
                                    <!-- Stats -->
                                    <div class="flex items-center gap-4 text-xs">
                                        <span class="text-muted-foreground">
                                            <Clock class="w-3 h-3 inline mr-1" />
                                            {{ new Date(version.created_at).toLocaleString() }}
                                        </span>
                                        <span class="text-muted-foreground">
                                            {{ version.mod_ids.length }} mods
                                        </span>
                                    </div>

                                    <!-- Changes -->
                                    <div v-if="version.changes.length > 0">
                                        <div
                                            class="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                                            Changes</div>
                                        <div class="space-y-1.5">
                                            <div v-for="(change, idx) in version.changes.slice(0, 10)" :key="idx"
                                                class="flex items-center gap-2 text-sm">
                                                <div class="w-5 h-5 rounded flex items-center justify-center shrink-0"
                                                    :class="getChangeColor(change.type)">
                                                    <component :is="getChangeIcon(change.type)" class="w-3 h-3" />
                                                </div>
                                                <span class="truncate">{{ change.modName }}</span>
                                                <span v-if="change.type === 'update'"
                                                    class="text-xs text-muted-foreground font-mono">
                                                    {{ change.previousVersion }} → {{ change.newVersion }}
                                                </span>
                                            </div>
                                            <div v-if="version.changes.length > 10"
                                                class="text-xs text-muted-foreground pl-7">
                                                +{{ version.changes.length - 10 }} more changes
                                            </div>
                                        </div>
                                    </div>

                                    <div v-else class="text-xs text-muted-foreground italic">
                                        Initial snapshot
                                    </div>
                                </div>
                            </Transition>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Commit Dialog -->
        <Dialog :open="showCommitDialog" title="Save New Version" @close="showCommitDialog = false">
            <div class="space-y-4 py-2">
                <p class="text-sm text-muted-foreground">
                    Create a snapshot of the current modpack state.
                </p>

                <div class="space-y-2">
                    <label class="text-sm font-medium">Version Tag</label>
                    <Input v-model="commitTag" placeholder="e.g., 1.2.0 (auto-generated if empty)" />
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-medium">Description *</label>
                    <textarea v-model="commitMessage"
                        class="flex min-h-[100px] w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none"
                        placeholder="What changed in this version?"></textarea>
                </div>
            </div>

            <template #footer>
                <Button variant="outline" @click="showCommitDialog = false">Cancel</Button>
                <Button @click="createVersion" :disabled="!commitMessage.trim() || isLoading" class="gap-1.5">
                    <Save class="w-4 h-4" />
                    Save Version
                </Button>
            </template>
        </Dialog>
    </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
    transition: all 0.2s ease;
    overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
    opacity: 0;
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
}

.expand-enter-to,
.expand-leave-from {
    max-height: 300px;
}
</style>
