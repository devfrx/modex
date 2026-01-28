<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { createLogger } from "@/utils/logger";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import Input from "@/components/ui/Input.vue";
import Tooltip from "@/components/ui/Tooltip.vue";
import { useDialog } from "@/composables/useDialog";
import { useToast } from "@/composables/useToast";
import type { ModpackVersion, ModpackVersionHistory, ModpackChange } from "@/types/electron";
import Icon from "@/components/ui/Icon.vue";

const log = createLogger("VersionHistoryPanel");

const props = defineProps<{
    modpackId: string;
    modpackName: string;
    /** Instance ID to sync configs from before creating version */
    instanceId?: string;
    /** Whether this modpack is managed by a remote source (read-only) */
    isLinked?: boolean;
}>();

const emit = defineEmits<{
    (e: "refresh"): void;
    (e: "unsaved-changes", count: number): void;
}>();

const toast = useToast();
const { confirm } = useDialog();

const history = ref<ModpackVersionHistory | null>(null);
const isLoading = ref(false);
const showCommitDialog = ref(false);
const commitMessage = ref("");
const commitTag = ref("");
const expandedVersions = ref<Set<string>>(new Set());
// Track which change sections are expanded in unsaved changes
const expandedChangeSections = ref<Set<string>>(new Set());
// Track which change sections show all items (not just first 8)
const showAllItems = ref<Set<string>>(new Set());
// Track which versions have their full changes list expanded
const expandedVersionChanges = ref<Set<string>>(new Set());

// View mode: 'timeline' or 'compact'
const viewMode = ref<'timeline' | 'compact'>('timeline');

// Search/filter
const searchQuery = ref('');

// Unsaved changes tracking
const unsavedChanges = ref<{
    hasChanges: boolean;
    changes: {
        modsAdded: Array<{ id: string; name: string }>;
        modsRemoved: Array<{ id: string; name: string }>;
        modsEnabled: Array<{ id: string; name: string }>;
        modsDisabled: Array<{ id: string; name: string }>;
        modsUpdated: Array<{ id: string; name: string; oldVersion?: string; newVersion?: string }>;
        modsLocked: Array<{ id: string; name: string }>;
        modsUnlocked: Array<{ id: string; name: string }>;
        notesAdded: Array<{ id: string; name: string; note: string }>;
        notesRemoved: Array<{ id: string; name: string; note: string }>;
        notesChanged: Array<{ id: string; name: string; oldNote: string; newNote: string }>;
        loaderChanged: { oldLoader?: string; newLoader?: string; oldVersion?: string; newVersion?: string } | null;
        configsChanged: boolean;
        configDetails?: Array<{
            filePath: string;
            keyPath: string;
            line?: number;
            oldValue: any;
            newValue: any;
            timestamp: string;
        }>;
    };
} | null>(null);
const isReverting = ref(false);

// Progress tracking
const showProgressOverlay = ref(false);
const progressTitle = ref("");
const progressMessage = ref("");
const progressStep = ref(0);
const progressSteps = ref<string[]>([]);

// Computed
const versions = computed(() => {
    if (!history.value) return [];
    let result = [...history.value.versions].reverse();

    // Apply search filter
    if (searchQuery.value.trim()) {
        const q = searchQuery.value.toLowerCase();
        result = result.filter(v =>
            v.message.toLowerCase().includes(q) ||
            v.tag.toLowerCase().includes(q) ||
            v.changes.some(c => c.modName.toLowerCase().includes(q))
        );
    }

    return result;
});

const currentVersionId = computed(() => history.value?.current_version_id);
const hasVersionControl = computed(() => history.value !== null && history.value.versions.length > 0);

// Stats computed
const versionStats = computed(() => {
    if (!history.value) return null;
    const total = history.value.versions.length;
    const totalMods = history.value.versions[history.value.versions.length - 1]?.mod_ids.length || 0;

    // Calculate changes over time
    let totalAdds = 0, totalRemoves = 0, totalUpdates = 0;
    history.value.versions.forEach(v => {
        v.changes.forEach(c => {
            if (c.type === 'add') totalAdds++;
            else if (c.type === 'remove') totalRemoves++;
            else if (c.type === 'update') totalUpdates++;
        });
    });

    return {
        totalVersions: total,
        currentMods: totalMods,
        totalAdds,
        totalRemoves,
        totalUpdates
    };
});

// Computed for unsaved changes
const hasUnsavedChanges = computed(() => unsavedChanges.value?.hasChanges ?? false);
const configChangeCount = computed(() => {
    return unsavedChanges.value?.changes?.configDetails?.length || (unsavedChanges.value?.changes?.configsChanged ? 1 : 0);
});
const unsavedChangeCount = computed(() => {
    if (!unsavedChanges.value?.changes) return 0;
    const c = unsavedChanges.value.changes;
    const loaderChange = c.loaderChanged ? 1 : 0;
    const notesCount = (c.notesAdded?.length || 0) + (c.notesRemoved?.length || 0) + (c.notesChanged?.length || 0);
    return c.modsAdded.length + c.modsRemoved.length + c.modsEnabled.length + c.modsDisabled.length + (c.modsUpdated?.length || 0) + (c.modsLocked?.length || 0) + (c.modsUnlocked?.length || 0) + notesCount + loaderChange + configChangeCount.value;
});

// Grouped unsaved changes for better visualization
const groupedUnsavedChanges = computed(() => {
    if (!unsavedChanges.value?.changes) return [];
    const c = unsavedChanges.value.changes;
    const groups: Array<{
        key: string;
        type: string;
        label: string;
        icon: string;
        color: string;
        bgColor: string;
        count: number;
        items: any[];
    }> = [];

    if (c.modsAdded.length > 0) {
        groups.push({
            key: 'added',
            type: 'added',
            label: 'Mods Added',
            icon: 'Plus',
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/15',
            count: c.modsAdded.length,
            items: c.modsAdded
        });
    }
    if (c.modsRemoved.length > 0) {
        groups.push({
            key: 'removed',
            type: 'removed',
            label: 'Mods Removed',
            icon: 'Minus',
            color: 'text-red-400',
            bgColor: 'bg-red-500/15',
            count: c.modsRemoved.length,
            items: c.modsRemoved
        });
    }
    if (c.modsUpdated?.length > 0) {
        groups.push({
            key: 'updated',
            type: 'updated',
            label: 'Mods Updated',
            icon: 'RefreshCw',
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/15',
            count: c.modsUpdated.length,
            items: c.modsUpdated
        });
    }
    if (c.modsEnabled.length > 0) {
        groups.push({
            key: 'enabled',
            type: 'enabled',
            label: 'Mods Enabled',
            icon: 'ToggleRight',
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/15',
            count: c.modsEnabled.length,
            items: c.modsEnabled
        });
    }
    if (c.modsDisabled.length > 0) {
        groups.push({
            key: 'disabled',
            type: 'disabled',
            label: 'Mods Disabled',
            icon: 'ToggleLeft',
            color: 'text-amber-400',
            bgColor: 'bg-amber-500/12',
            count: c.modsDisabled.length,
            items: c.modsDisabled
        });
    }
    if (c.loaderChanged) {
        groups.push({
            key: 'loader',
            type: 'loader',
            label: 'Loader Changed',
            icon: 'Box',
            color: 'text-orange-400',
            bgColor: 'bg-orange-500/12',
            count: 1,
            items: [c.loaderChanged]
        });
    }
    if (c.configsChanged && configChangeCount.value > 0) {
        groups.push({
            key: 'configs',
            type: 'configs',
            label: 'Config Changes',
            icon: 'Settings',
            color: 'text-purple-400',
            bgColor: 'bg-purple-500/12',
            count: configChangeCount.value,
            items: c.configDetails || []
        });
    }
    if ((c.notesAdded?.length || 0) + (c.notesRemoved?.length || 0) + (c.notesChanged?.length || 0) > 0) {
        groups.push({
            key: 'notes',
            type: 'notes',
            label: 'Notes Changed',
            icon: 'StickyNote',
            color: 'text-purple-400',
            bgColor: 'bg-purple-500/12',
            count: (c.notesAdded?.length || 0) + (c.notesRemoved?.length || 0) + (c.notesChanged?.length || 0),
            items: [...(c.notesAdded || []), ...(c.notesRemoved || []), ...(c.notesChanged || [])]
        });
    }
    if (c.modsLocked?.length > 0) {
        groups.push({
            key: 'locked',
            type: 'locked',
            label: 'Mods Locked',
            icon: 'Lock',
            color: 'text-amber-400',
            bgColor: 'bg-amber-500/12',
            count: c.modsLocked.length,
            items: c.modsLocked
        });
    }
    if (c.modsUnlocked?.length > 0) {
        groups.push({
            key: 'unlocked',
            type: 'unlocked',
            label: 'Mods Unlocked',
            icon: 'LockOpen',
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/15',
            count: c.modsUnlocked.length,
            items: c.modsUnlocked
        });
    }

    return groups;
});

// Helper functions for config display
const getFileName = (filePath: string): string => {
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || filePath;
};

const formatConfigValue = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 20);
    return String(value).slice(0, 20);
};

// Load unsaved changes
async function loadUnsavedChanges() {
    try {
        unsavedChanges.value = await window.api.modpacks.getUnsavedChanges(props.modpackId);
        // Emit unsaved changes count to parent
        emit("unsaved-changes", unsavedChangeCount.value);
    } catch (err) {
        log.error("Failed to load unsaved changes", { modpackId: props.modpackId, error: String(err) });
    }
}

// Revert unsaved changes
async function revertChanges() {
    const confirmed = await confirm({
        title: "Revert Unsaved Changes",
        message: "This will discard all changes since the last saved version. This cannot be undone.",
        variant: "warning",
        icon: "warning",
        confirmText: "Revert",
        cancelText: "Cancel"
    });

    if (!confirmed) return;

    isReverting.value = true;
    try {
        const result = await window.api.modpacks.revertUnsavedChanges(props.modpackId);
        if (result.success) {
            // Check if some mods were skipped (deleted from library)
            if (result.skippedMods > 0 && result.missingMods.length > 0) {
                const missingNames = result.missingMods.slice(0, 3).map(m => m.name).join(", ");
                const more = result.missingMods.length > 3 ? ` and ${result.missingMods.length - 3} more` : "";
                toast.warning(
                    "Partial Revert",
                    `Restored ${result.restoredMods} mods. ${result.skippedMods} mod(s) were deleted from library and couldn't be restored: ${missingNames}${more}`
                );
            } else {
                toast.success("Changes Reverted", "Modpack restored to last saved version");
            }
            await loadUnsavedChanges();
            emit("refresh");
            // Dispatch global event to notify other components (e.g., ConfigStructuredEditor in PlayModpackDialog)
            window.dispatchEvent(new CustomEvent('modex:configReverted', { detail: { modpackId: props.modpackId } }));
        } else {
            toast.error("Failed", "Could not revert changes");
        }
    } catch (err) {
        toast.error("Failed", (err as Error).message);
    } finally {
        isReverting.value = false;
    }
}

// Load version history
async function loadHistory() {
    isLoading.value = true;
    try {
        history.value = await window.api.versions.getHistory(props.modpackId);
        // Also load unsaved changes
        await loadUnsavedChanges();
    } catch (err) {
        log.error("Failed to load version history", { modpackId: props.modpackId, error: String(err) });
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

    showCommitDialog.value = false;

    // Show progress overlay
    progressTitle.value = "Saving Version";
    progressSteps.value = props.instanceId
        ? ["Syncing configs from instance...", "Creating snapshot...", "Saving version..."]
        : ["Creating snapshot...", "Saving version..."];
    progressStep.value = 0;
    progressMessage.value = progressSteps.value[0];
    showProgressOverlay.value = true;

    try {
        // Simulate step progress
        if (props.instanceId) {
            await new Promise(r => setTimeout(r, 300));
            progressStep.value = 1;
            progressMessage.value = progressSteps.value[1];
        }

        await new Promise(r => setTimeout(r, 200));
        progressStep.value = props.instanceId ? 2 : 1;
        progressMessage.value = progressSteps.value[progressStep.value];

        // Pass instanceId to sync configs from instance before creating snapshot
        const version = await window.api.versions.create(
            props.modpackId,
            commitMessage.value.trim(),
            commitTag.value.trim() || undefined,
            props.instanceId  // If provided, syncs instance configs to modpack first
        );

        showProgressOverlay.value = false;

        if (version) {
            await loadHistory();
            const syncMsg = props.instanceId ? " (configs synced from instance)" : "";
            toast.success("Version Created", `Created version ${version.tag}${syncMsg}`);
            commitMessage.value = "";
            commitTag.value = "";
            emit("refresh");
        } else {
            toast.info("No Changes", "No changes detected since last version");
        }
    } catch (err) {
        showProgressOverlay.value = false;
        toast.error("Failed", (err as Error).message);
    }
}

// Rollback to version
async function rollbackTo(version: ModpackVersion) {
    // First validate the rollback
    try {
        const validation = await window.api.versions.validateRollback(props.modpackId, version.id);

        if (!validation.valid) {
            const errorMsg = validation.missingMods.length > 0
                ? `${validation.missingMods.length} mod(s) cannot be restored`
                : "Validation failed";
            toast.error("Cannot Rollback", errorMsg);
            return;
        }

        // Build confirmation message with warnings
        let message = `Restore modpack to version ${version.tag}? This will restore mods and configs. A rollback commit will be created.`;

        if (validation.missingMods.length > 0) {
            const missingNames = validation.missingMods.map(m => m.name).slice(0, 3).join(", ");
            const more = validation.missingMods.length > 3 ? ` and ${validation.missingMods.length - 3} more` : "";
            message += `\n\n⚠️ ${validation.missingMods.length} mod(s) will need to be re-downloaded: ${missingNames}${more}`;
        }

        if (validation.brokenDependencies.length > 0) {
            message += `\n\n⚠️ ${validation.brokenDependencies.length} mod(s) have missing dependencies`;
        }

        const confirmed = await confirm({
            title: "Rollback to Version",
            message,
            variant: "warning",
            icon: "warning",
            confirmText: "Rollback",
            cancelText: "Cancel"
        });

        if (!confirmed) return;
    } catch (err) {
        log.error("Failed to validate rollback", { modpackId: props.modpackId, error: String(err) });
        // Fall back to simple confirmation
        const confirmed = await confirm({
            title: "Rollback to Version",
            message: `Restore modpack to version ${version.tag}? This will restore mods and configs. A rollback commit will be created.`,
            variant: "warning",
            icon: "warning",
            confirmText: "Rollback",
            cancelText: "Cancel"
        });
        if (!confirmed) return;
    }

    // Show progress overlay
    progressTitle.value = "Rolling Back";
    progressSteps.value = [
        "Preparing rollback...",
        "Restoring mod list...",
        "Restoring configs...",
        "Re-downloading missing mods...",
        "Creating rollback commit..."
    ];
    progressStep.value = 0;
    progressMessage.value = progressSteps.value[0];
    showProgressOverlay.value = true;

    try {
        // Animate through steps
        const stepInterval = setInterval(() => {
            if (progressStep.value < progressSteps.value.length - 1) {
                progressStep.value++;
                progressMessage.value = progressSteps.value[progressStep.value];
            }
        }, 800);

        const result = await window.api.versions.rollback(props.modpackId, version.id);

        clearInterval(stepInterval);
        showProgressOverlay.value = false;

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
        showProgressOverlay.value = false;
        toast.error("Failed", (err as Error).message);
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

// Toggle change section expansion (for unsaved changes)
function toggleChangeSection(section: string) {
    if (expandedChangeSections.value.has(section)) {
        expandedChangeSections.value.delete(section);
    } else {
        expandedChangeSections.value.add(section);
    }
}

// Toggle version changes list expansion
function toggleVersionChanges(versionId: string) {
    if (expandedVersionChanges.value.has(versionId)) {
        expandedVersionChanges.value.delete(versionId);
    } else {
        expandedVersionChanges.value.add(versionId);
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
function getChangeIcon(type: ModpackChange["type"], modId?: string): string {
    // Config changes have special icon
    if (modId === "_configs_") return "FileCode";
    // Loader changes have special icon
    if (modId === "_loader_") return "Box";

    switch (type) {
        case "add": return "Plus";
        case "remove": return "Minus";
        case "update": return "RefreshCw";
        case "enable": return "ToggleRight";
        case "disable": return "ToggleLeft";
        case "lock": return "Lock";
        case "unlock": return "LockOpen";
        case "version_control": return "GitBranch";
        case "loader_change": return "Box";
        case "note_add": return "StickyNote";
        case "note_remove": return "StickyNote";
        case "note_change": return "StickyNote";
        default: return "Circle";
    }
}

// Get change color class
function getChangeColor(type: ModpackChange["type"], modId?: string): string {
    // Config changes have special color
    if (modId === "_configs_") return "text-purple-400 bg-purple-500/15";
    // Loader changes have special color
    if (modId === "_loader_") return "text-orange-400 bg-orange-500/15";

    switch (type) {
        case "add": return "text-emerald-400 bg-emerald-500/15";
        case "remove": return "text-red-400 bg-red-500/15";
        case "update": return "text-blue-400 bg-blue-500/15";
        case "enable": return "text-emerald-400 bg-emerald-500/15";
        case "disable": return "text-amber-400 bg-amber-500/15";
        case "lock": return "text-amber-400 bg-amber-500/15";
        case "unlock": return "text-emerald-400 bg-emerald-500/15";
        case "version_control": return "text-violet-400 bg-violet-500/15";
        case "loader_change": return "text-orange-400 bg-orange-500/15";
        case "note_add": return "text-purple-400 bg-purple-500/15";
        case "note_remove": return "text-purple-400 bg-purple-500/15";
        case "note_change": return "text-purple-400 bg-purple-500/15";
        default: return "text-muted-foreground bg-muted";
    }
}

// Get change summary for version card
function getChangeSummary(changes: ModpackChange[]): { adds: number; removes: number; updates: number; others: number } {
    let adds = 0, removes = 0, updates = 0, others = 0;
    changes.forEach(c => {
        if (c.type === 'add') adds++;
        else if (c.type === 'remove') removes++;
        else if (c.type === 'update') updates++;
        else others++;
    });
    return { adds, removes, updates, others };
}

// Check if change is config-related
function isConfigChange(change: ModpackChange): boolean {
    return change.modId === "_configs_";
}

// Check if change is loader-related
function isLoaderChange(change: ModpackChange): boolean {
    return change.modId === "_loader_" || change.type === "loader_change";
}

// Watch for modpack changes
watch(() => props.modpackId, () => {
    loadHistory();
}, { immediate: true });
</script>

<template>
    <div class="h-full flex flex-col bg-gradient-to-br from-background via-background to-muted/10">
        <!-- Header Section -->
        <div class="shrink-0 pb-4 border-b border-border/30">
            <!-- Title Row -->
            <div class="flex items-start justify-between gap-4 mb-4">
                <div class="flex items-start gap-3">
                    <div class="relative">
                        <div class="absolute inset-0 bg-primary/20 rounded-xl blur-md"></div>
                        <div
                            class="relative w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                            <Icon name="GitBranch" class="w-5 h-5 text-primary" />
                        </div>
                    </div>
                    <div>
                        <h3 class="text-lg font-semibold flex items-center gap-2">
                            Version History
                            <span v-if="hasUnsavedChanges"
                                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                {{ unsavedChangeCount }} unsaved
                            </span>
                        </h3>
                        <p class="text-sm text-muted-foreground mt-0.5">
                            Track changes and rollback to any previous state
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <!-- View Toggle -->
                    <div v-if="hasVersionControl"
                        class="flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5">
                        <button @click="viewMode = 'timeline'"
                            class="px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
                            :class="viewMode === 'timeline' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'">
                            <Icon name="GitCommit" class="w-3.5 h-3.5" />
                        </button>
                        <button @click="viewMode = 'compact'"
                            class="px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
                            :class="viewMode === 'compact' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'">
                            <Icon name="List" class="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <!-- Save Version Button -->
                    <Button v-if="hasVersionControl && !props.isLinked" size="sm" variant="default" class="gap-1.5"
                        @click="showCommitDialog = true" :disabled="isLoading">
                        <Icon name="Plus" class="w-4 h-4" />
                        Save Version
                    </Button>
                    <!-- Remote locked indicator -->
                    <div v-else-if="hasVersionControl && props.isLinked"
                        class="flex items-center gap-1.5 text-sm text-muted-foreground px-3 py-1.5 rounded-lg bg-muted/30 border border-border/50">
                        <Icon name="Lock" class="w-3.5 h-3.5" />
                        <span>Managed remotely</span>
                    </div>
                </div>
            </div>

        </div>

        <!-- Loading State -->
        <div v-if="isLoading && !history" class="flex-1 flex items-center justify-center">
            <div class="text-center">
                <div class="relative w-16 h-16 mx-auto mb-4">
                    <div class="absolute inset-0 rounded-full border-2 border-primary/20"></div>
                    <div
                        class="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin">
                    </div>
                    <div class="absolute inset-3 rounded-full bg-primary/10 flex items-center justify-center">
                        <Icon name="GitBranch" class="w-5 h-5 text-primary animate-pulse" />
                    </div>
                </div>
                <p class="text-sm text-muted-foreground">Loading version history...</p>
            </div>
        </div>

        <!-- No Version Control - Modern Onboarding -->
        <div v-else-if="!hasVersionControl"
            class="flex-1 flex items-center justify-center p-8 relative overflow-hidden">
            <!-- Animated Background -->
            <div class="absolute inset-0 overflow-hidden pointer-events-none">
                <div class="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-pulse" />
                <div class="absolute bottom-1/3 right-1/4 w-80 h-80 bg-violet-500/5 rounded-full blur-3xl animate-pulse"
                    style="animation-delay: 1s;" />
            </div>

            <div class="relative z-10 text-center max-w-md">
                <!-- Animated Icon -->
                <div class="relative mx-auto w-24 h-24 mb-6">
                    <div class="absolute inset-0 bg-primary/20 rounded-2xl rotate-6 blur-sm animate-pulse"></div>
                    <div class="absolute inset-0 bg-violet-500/10 rounded-2xl -rotate-6 blur-sm animate-pulse"
                        style="animation-delay: 0.5s;"></div>
                    <div
                        class="relative w-full h-full bg-gradient-to-br from-primary/15 to-violet-500/10 rounded-2xl flex items-center justify-center border border-primary/20 backdrop-blur-sm">
                        <Icon name="Sparkles" class="w-12 h-12 text-primary" />
                    </div>
                </div>

                <h2 class="text-xl font-bold mb-2 text-foreground">Enable Version Control</h2>
                <p class="text-muted-foreground text-sm mb-6 leading-relaxed">
                    Create snapshots of your modpack, track every change, and instantly rollback if something breaks.
                </p>

                <!-- Feature Pills -->
                <div class="flex flex-wrap justify-center gap-2 mb-6">
                    <div
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                        <Icon name="History" class="w-3 h-3" />
                        Time Travel
                    </div>
                    <div
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium border border-blue-500/20">
                        <Icon name="Eye" class="w-3 h-3" />
                        Change Tracking
                    </div>
                    <div
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-400 text-xs font-medium border border-purple-500/20">
                        <Icon name="Shield" class="w-3 h-3" />
                        Safe Rollback
                    </div>
                </div>

                <!-- Remote locked -->
                <div v-if="props.isLinked"
                    class="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 mb-4 backdrop-blur-sm">
                    <div class="flex items-center justify-center gap-2 text-amber-400 text-sm">
                        <Icon name="Lock" class="w-4 h-4" />
                        <span>Version control is managed by the remote source</span>
                    </div>
                </div>

                <Button @click="initializeVersionControl" :disabled="isLoading || props.isLinked"
                    class="gap-2 px-6 h-11 text-sm font-medium shadow-lg shadow-primary/20" size="lg">
                    <Icon v-if="props.isLinked" name="Lock" class="w-4 h-4" />
                    <Icon v-else-if="isLoading" name="Loader2" class="w-4 h-4 animate-spin" />
                    <Icon v-else name="Zap" class="w-4 h-4" />
                    {{ props.isLinked ? 'Locked' : isLoading ? 'Enabling...' : 'Enable Now' }}
                </Button>
            </div>
        </div>

        <!-- Version Timeline -->
        <div v-else class="flex-1 overflow-y-auto pt-4 -mx-2 px-2 custom-scrollbar">
            <!-- Unsaved Changes Card -->
            <Transition name="slide-fade">
                <div v-if="hasUnsavedChanges && unsavedChanges"
                    class="mb-5 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 overflow-hidden">
                    <!-- Header -->
                    <div class="p-4 border-b border-amber-500/20">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="relative">
                                    <div
                                        class="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center border border-amber-500/20">
                                        <Icon name="GitCommitHorizontal" class="w-5 h-5 text-amber-400" />
                                    </div>
                                    <span
                                        class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-[10px] font-bold flex items-center justify-center text-black">
                                        {{ unsavedChangeCount }}
                                    </span>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-amber-400 flex items-center gap-2">
                                        Uncommitted Changes
                                        <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                    </h4>
                                    <p class="text-xs text-muted-foreground">Changes since last saved version</p>
                                </div>
                            </div>
                            <div v-if="!props.isLinked" class="flex items-center gap-2">
                                <Tooltip content="Discard all changes" position="bottom">
                                    <Button size="sm" variant="ghost"
                                        class="h-8 w-8 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                        @click="revertChanges" :disabled="isReverting">
                                        <Icon v-if="!isReverting" name="Undo2" class="w-4 h-4" />
                                        <Icon v-else name="Loader2" class="w-4 h-4 animate-spin" />
                                    </Button>
                                </Tooltip>
                                <Button size="sm" class="gap-1.5 h-8 bg-amber-500/90 hover:bg-amber-500 text-black"
                                    @click="showCommitDialog = true">
                                    <Icon name="Check" class="w-3.5 h-3.5" />
                                    Commit
                                </Button>
                            </div>
                        </div>
                    </div>

                    <!-- Change Groups - Modern Grid -->
                    <div class="p-3">
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <div v-for="group in groupedUnsavedChanges" :key="group.type"
                                class="group relative p-3 rounded-lg border border-border/30 bg-background/50 hover:bg-background/80 transition-all cursor-pointer"
                                @click="toggleChangeSection(group.type)">
                                <!-- Top Row: Icon + Count -->
                                <div class="flex items-center justify-between mb-2">
                                    <div class="w-7 h-7 rounded-md flex items-center justify-center"
                                        :class="group.bgColor">
                                        <Icon :name="group.icon" class="w-3.5 h-3.5" :class="group.color" />
                                    </div>
                                    <span class="text-lg font-bold" :class="group.color">{{ group.count }}</span>
                                </div>
                                <!-- Label -->
                                <div class="text-xs text-muted-foreground font-medium">{{ group.label }}</div>

                                <!-- Expanded Items -->
                                <Transition name="expand">
                                    <div v-if="expandedChangeSections.has(group.type)"
                                        class="mt-2 pt-2 border-t border-border/30 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                        <template v-if="group.type === 'updated'">
                                            <div v-for="item in group.items" :key="item.id"
                                                class="flex items-center gap-2 text-xs">
                                                <span class="truncate flex-1 text-foreground/80">{{ item.name }}</span>
                                                <span class="font-mono text-[10px] flex items-center gap-1 shrink-0">
                                                    <span class="text-red-400/70">{{ item.oldVersion }}</span>
                                                    <Icon name="ArrowRight" class="w-2.5 h-2.5 text-muted-foreground" />
                                                    <span class="text-emerald-400">{{ item.newVersion }}</span>
                                                </span>
                                            </div>
                                        </template>
                                        <template v-else-if="group.type === 'loader'">
                                            <div class="flex items-center gap-2 text-xs">
                                                <span class="font-mono flex items-center gap-1">
                                                    <span class="text-red-400/70">{{ group.items[0]?.oldVersion ||
                                                        group.items[0]?.oldLoader }}</span>
                                                    <Icon name="ArrowRight" class="w-2.5 h-2.5 text-muted-foreground" />
                                                    <span class="text-emerald-400">{{ group.items[0]?.newVersion ||
                                                        group.items[0]?.newLoader }}</span>
                                                </span>
                                            </div>
                                        </template>
                                        <template v-else-if="group.type === 'configs'">
                                            <div v-for="(cfg, idx) in (showAllItems.has(group.type) ? group.items : group.items.slice(0, 8))"
                                                :key="idx"
                                                class="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <span class="text-cyan-400 font-mono text-[10px]" v-if="cfg.line">L{{
                                                    cfg.line }}</span>
                                                <span class="truncate">{{ getFileName(cfg.filePath) }}</span>
                                            </div>
                                            <button v-if="group.items.length > 8 && !showAllItems.has(group.type)"
                                                class="text-[10px] text-blue-400 hover:text-blue-300 hover:underline cursor-pointer mt-1"
                                                @click.stop="showAllItems.add(group.type)">
                                                +{{ group.items.length - 8 }} more
                                            </button>
                                            <button v-else-if="group.items.length > 8 && showAllItems.has(group.type)"
                                                class="text-[10px] text-blue-400 hover:text-blue-300 hover:underline cursor-pointer mt-1"
                                                @click.stop="showAllItems.delete(group.type)">
                                                Show less
                                            </button>
                                        </template>
                                        <template v-else>
                                            <div v-for="item in (showAllItems.has(group.type) ? group.items : group.items.slice(0, 8))"
                                                :key="item.id" class="text-xs text-foreground/80 truncate">
                                                {{ item.name }}
                                            </div>
                                            <button v-if="group.items.length > 8 && !showAllItems.has(group.type)"
                                                class="text-[10px] text-blue-400 hover:text-blue-300 hover:underline cursor-pointer mt-1"
                                                @click.stop="showAllItems.add(group.type)">
                                                +{{ group.items.length - 8 }} more
                                            </button>
                                            <button v-else-if="group.items.length > 8 && showAllItems.has(group.type)"
                                                class="text-[10px] text-blue-400 hover:text-blue-300 hover:underline cursor-pointer mt-1"
                                                @click.stop="showAllItems.delete(group.type)">
                                                Show less
                                            </button>
                                        </template>
                                    </div>
                                </Transition>

                                <!-- Expand Indicator -->
                                <Icon :name="expandedChangeSections.has(group.type) ? 'ChevronUp' : 'ChevronDown'"
                                    class="absolute top-2 right-2 w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </div>

                        <!-- Locked Message -->
                        <div v-if="props.isLinked"
                            class="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                            <Icon name="Lock" class="w-4 h-4" />
                            <span>Version control is managed by the remote source</span>
                        </div>
                    </div>
                </div>
            </Transition>

            <!-- Search Bar (for many versions) -->
            <div v-if="versions.length > 5" class="mb-4">
                <div class="relative">
                    <Icon name="Search"
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input v-model="searchQuery" type="text" placeholder="Search versions..."
                        class="w-full h-9 pl-9 pr-4 rounded-lg border border-border/50 bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 placeholder:text-muted-foreground" />
                </div>
            </div>

            <!-- Timeline View -->
            <div v-if="viewMode === 'timeline'" class="relative">
                <!-- Timeline Line -->
                <div
                    class="absolute left-[19px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-primary/50 via-border/50 to-transparent">
                </div>

                <!-- Version Items -->
                <div class="space-y-3">
                    <TransitionGroup name="list">
                        <div v-for="(version, index) in versions" :key="version.id" class="relative group">
                            <!-- Timeline Node -->
                            <div class="absolute left-0 top-4 w-10 flex justify-center z-10">
                                <div class="w-3 h-3 rounded-full border-2 transition-colors" :class="version.id === currentVersionId
                                    ? 'bg-primary border-primary'
                                    : 'bg-background border-border'">
                                </div>
                            </div>

                            <!-- Version Card -->
                            <div class="ml-12 rounded-lg border transition-all duration-200 overflow-hidden" :class="version.id === currentVersionId
                                ? 'border-primary/30 bg-primary/5'
                                : 'border-border/50 hover:border-border bg-card/30 hover:bg-card/50'">

                                <!-- Card Header -->
                                <div class="flex items-center gap-3 p-3 cursor-pointer"
                                    @click="toggleExpanded(version.id)">
                                    <!-- Version Info -->
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 mb-0.5">
                                            <span class="font-mono text-sm font-semibold">{{ version.tag }}</span>
                                            <span v-if="version.id === currentVersionId"
                                                class="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium uppercase tracking-wide">
                                                Current
                                            </span>
                                            <span v-else-if="index === 0"
                                                class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/12 text-amber-500 font-medium uppercase tracking-wide">
                                                Latest
                                            </span>
                                        </div>
                                        <p class="text-sm text-muted-foreground line-clamp-1">{{ version.message }}</p>
                                    </div>

                                    <!-- Change Summary Pills -->
                                    <div class="hidden sm:flex items-center gap-1.5 shrink-0">
                                        <template v-if="version.changes.length > 0">
                                            <span v-if="getChangeSummary(version.changes).adds > 0"
                                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
                                                <Icon name="Plus" class="w-2.5 h-2.5" />
                                                {{ getChangeSummary(version.changes).adds }}
                                            </span>
                                            <span v-if="getChangeSummary(version.changes).removes > 0"
                                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400">
                                                <Icon name="Minus" class="w-2.5 h-2.5" />
                                                {{ getChangeSummary(version.changes).removes }}
                                            </span>
                                            <span v-if="getChangeSummary(version.changes).updates > 0"
                                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400">
                                                <Icon name="RefreshCw" class="w-2.5 h-2.5" />
                                                {{ getChangeSummary(version.changes).updates }}
                                            </span>
                                        </template>
                                        <span v-else
                                            class="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                                            Initial
                                        </span>
                                    </div>

                                    <!-- Meta & Actions -->
                                    <div class="flex items-center gap-2 shrink-0">
                                        <span class="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
                                            {{ formatDate(version.created_at) }}
                                        </span>

                                        <Tooltip v-if="version.id !== currentVersionId && !props.isLinked"
                                            content="Restore this version" position="left">
                                            <Button size="sm" variant="ghost"
                                                class="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                @click.stop="rollbackTo(version)">
                                                <Icon name="RotateCcw" class="w-4 h-4" />
                                            </Button>
                                        </Tooltip>

                                        <div class="w-6 h-6 rounded-md flex items-center justify-center bg-muted/30 transition-colors"
                                            :class="expandedVersions.has(version.id) ? 'bg-primary/10 text-primary' : 'text-muted-foreground'">
                                            <Icon :name="expandedVersions.has(version.id) ? 'ChevronUp' : 'ChevronDown'"
                                                class="w-4 h-4 transition-transform duration-200" />
                                        </div>
                                    </div>
                                </div>

                                <!-- Expanded Details -->
                                <Transition name="expand">
                                    <div v-if="expandedVersions.has(version.id)"
                                        class="border-t border-border/30 bg-muted/10">
                                        <!-- Meta Info Row -->
                                        <div
                                            class="flex items-center gap-4 px-4 py-3 text-xs text-muted-foreground border-b border-border/20">
                                            <span class="flex items-center gap-1.5">
                                                <Icon name="Calendar" class="w-3.5 h-3.5" />
                                                {{ new Date(version.created_at).toLocaleString() }}
                                            </span>
                                            <span class="flex items-center gap-1.5">
                                                <Icon name="Package" class="w-3.5 h-3.5" />
                                                {{ version.mod_ids.length }} mods
                                            </span>
                                            <span v-if="version.config_snapshot_id"
                                                class="flex items-center gap-1.5 text-purple-400">
                                                <Icon name="FileCode" class="w-3.5 h-3.5" />
                                                Config snapshot
                                            </span>
                                        </div>

                                        <!-- Changes List -->
                                        <div v-if="version.changes.length > 0 || (version.config_changes && version.config_changes.length > 0)"
                                            class="p-4">
                                            <div
                                                class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                                Changes in this version
                                            </div>

                                            <div class="space-y-1.5"
                                                :class="{ 'max-h-72 overflow-y-auto custom-scrollbar pr-2': expandedVersionChanges.has(version.id) && version.changes.length > 15 }">
                                                <div v-for="(change, idx) in (expandedVersionChanges.has(version.id) ? version.changes : version.changes.slice(0, 10))"
                                                    :key="idx"
                                                    class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors group/change">
                                                    <div class="w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-transform group-hover/change:scale-110"
                                                        :class="getChangeColor(change.type, change.modId)">
                                                        <Icon :name="getChangeIcon(change.type, change.modId)"
                                                            class="w-3 h-3" />
                                                    </div>
                                                    <span class="text-sm truncate flex-1">
                                                        {{ isConfigChange(change) ? 'Configuration files modified' :
                                                            change.modName }}
                                                    </span>
                                                    <span
                                                        v-if="(change.type === 'update' || change.type === 'loader_change') && !isConfigChange(change)"
                                                        class="text-xs font-mono flex items-center gap-1.5 shrink-0 bg-muted/30 px-2 py-0.5 rounded">
                                                        <span class="text-red-400/80">{{ change.previousVersion
                                                            }}</span>
                                                        <Icon name="ArrowRight" class="w-3 h-3 text-muted-foreground" />
                                                        <span class="text-emerald-400">{{ change.newVersion }}</span>
                                                    </span>
                                                </div>

                                                <!-- Show More/Less Button -->
                                                <button v-if="version.changes.length > 10"
                                                    class="w-full text-xs text-blue-400 hover:text-blue-300 py-2 flex items-center justify-center gap-1 transition-colors"
                                                    @click.stop="toggleVersionChanges(version.id)">
                                                    <Icon
                                                        :name="expandedVersionChanges.has(version.id) ? 'ChevronUp' : 'ChevronDown'"
                                                        class="w-3 h-3" />
                                                    {{ expandedVersionChanges.has(version.id) ? 'Show less' : `Show all
                                                    ${version.changes.length} changes` }}
                                                </button>
                                            </div>

                                            <!-- Config Changes Section -->
                                            <div v-if="version.config_changes && version.config_changes.length > 0"
                                                class="mt-4 pt-3 border-t border-border/20">
                                                <button
                                                    class="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors w-full"
                                                    @click.stop="toggleChangeSection(`config-${version.id}`)">
                                                    <Icon name="Settings" class="w-3.5 h-3.5" />
                                                    <span class="font-medium">{{ version.config_changes.length }} config
                                                        change{{ version.config_changes.length !== 1 ? 's' : ''
                                                        }}</span>
                                                    <Icon
                                                        :name="expandedChangeSections.has(`config-${version.id}`) ? 'ChevronUp' : 'ChevronDown'"
                                                        class="w-3 h-3 ml-auto" />
                                                </button>

                                                <Transition name="expand">
                                                    <div v-if="expandedChangeSections.has(`config-${version.id}`)"
                                                        class="mt-2 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                                        <div v-for="(cfg, idx) in version.config_changes.slice(0, 10)"
                                                            :key="idx"
                                                            class="flex items-center gap-2 text-xs text-muted-foreground bg-purple-500/5 rounded px-2 py-1.5 border border-purple-500/10">
                                                            <span v-if="cfg.line"
                                                                class="text-cyan-400 font-mono text-[10px] bg-cyan-500/10 px-1 rounded">L{{
                                                                    cfg.line }}</span>
                                                            <Tooltip :content="cfg.filePath" position="top">
                                                                <span class="text-white/70 truncate max-w-[120px]">{{
                                                                    getFileName(cfg.filePath)
                                                                    }}</span>
                                                            </Tooltip>
                                                            <span
                                                                class="text-white/90 font-medium truncate max-w-[80px]">{{
                                                                    cfg.keyPath.split('.').pop() }}</span>
                                                            <span
                                                                class="text-red-400/70 line-through truncate max-w-[50px]">{{
                                                                    formatConfigValue(cfg.oldValue) }}</span>
                                                            <Icon name="ArrowRight"
                                                                class="w-3 h-3 text-muted-foreground shrink-0" />
                                                            <span class="text-emerald-400 truncate max-w-[50px]">{{
                                                                formatConfigValue(cfg.newValue) }}</span>
                                                        </div>
                                                    </div>
                                                </Transition>
                                            </div>
                                        </div>

                                        <div v-else
                                            class="p-4 text-sm text-muted-foreground italic flex items-center gap-2">
                                            <Icon name="Bookmark" class="w-4 h-4" />
                                            Initial snapshot - baseline version
                                        </div>
                                    </div>
                                </Transition>
                            </div>
                        </div>
                    </TransitionGroup>
                </div>

                <!-- Empty Search State -->
                <div v-if="searchQuery && versions.length === 0" class="text-center py-12 text-muted-foreground">
                    <Icon name="Search" class="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p>No versions match "{{ searchQuery }}"</p>
                </div>
            </div>

            <!-- Compact View -->
            <div v-else class="space-y-1">
                <div v-for="(version, index) in versions" :key="version.id"
                    class="flex items-center gap-3 p-3 rounded-lg border border-border/30 hover:border-border/50 hover:bg-muted/20 transition-all cursor-pointer group"
                    @click="toggleExpanded(version.id)">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        :class="version.id === currentVersionId ? 'bg-primary/15 text-primary' : 'bg-muted/50 text-muted-foreground'">
                        <Icon name="GitCommit" class="w-4 h-4" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-sm font-medium">{{ version.tag }}</span>
                            <span v-if="version.id === currentVersionId"
                                class="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                                Current
                            </span>
                        </div>
                        <p class="text-xs text-muted-foreground truncate">{{ version.message }}</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="text-xs text-muted-foreground">{{ version.changes.length }} changes</span>
                        <span class="text-xs text-muted-foreground">{{ formatDate(version.created_at) }}</span>
                        <Button v-if="version.id !== currentVersionId && !props.isLinked" size="sm" variant="ghost"
                            class="h-7 w-7 p-0 opacity-0 group-hover:opacity-100" @click.stop="rollbackTo(version)">
                            <Icon name="RotateCcw" class="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Commit Dialog - Modern Design -->
        <Dialog :open="showCommitDialog" title="" @close="showCommitDialog = false">
            <div class="space-y-5">
                <!-- Dialog Header with Icon -->
                <div class="flex items-start gap-4">
                    <div
                        class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                        <Icon name="GitCommit" class="w-6 h-6 text-primary" />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-lg font-semibold">Save New Version</h3>
                        <p class="text-sm text-muted-foreground mt-0.5">
                            Create a snapshot of your current modpack state
                        </p>
                    </div>
                </div>

                <!-- Changes Summary Preview -->
                <div v-if="unsavedChanges && unsavedChangeCount > 0"
                    class="p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div class="flex items-center gap-2 text-sm font-medium mb-2">
                        <Icon name="FileStack" class="w-4 h-4 text-muted-foreground" />
                        <span>Changes to be saved</span>
                        <span class="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                            {{ unsavedChangeCount }} change{{ unsavedChangeCount !== 1 ? 's' : '' }}
                        </span>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        <span v-for="group in groupedUnsavedChanges" :key="group.key"
                            class="text-xs px-2 py-1 rounded-md flex items-center gap-1.5" :class="group.bgColor">
                            <Icon :name="group.icon" class="w-3 h-3" />
                            {{ group.count }} {{ group.label }}
                        </span>
                    </div>
                </div>

                <!-- Instance sync notice -->
                <div v-if="instanceId"
                    class="flex items-start gap-3 p-3 bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-lg">
                    <div class="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                        <Icon name="RefreshCw" class="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <p class="text-sm font-medium text-primary">Instance configs included</p>
                        <p class="text-xs text-muted-foreground mt-0.5">
                            Config modifications from your game instance will be saved with this version.
                        </p>
                    </div>
                </div>

                <!-- Form Fields -->
                <div class="space-y-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium flex items-center gap-2">
                            <Icon name="Tag" class="w-3.5 h-3.5 text-muted-foreground" />
                            Version Tag
                            <span class="text-xs text-muted-foreground font-normal">(optional)</span>
                        </label>
                        <Input v-model="commitTag" placeholder="e.g., 1.2.0 — auto-generated if empty"
                            class="font-mono" />
                    </div>

                    <div class="space-y-2">
                        <label class="text-sm font-medium flex items-center gap-2">
                            <Icon name="MessageSquare" class="w-3.5 h-3.5 text-muted-foreground" />
                            Description
                            <span class="text-xs text-red-400">*</span>
                        </label>
                        <textarea v-model="commitMessage"
                            class="flex min-h-[100px] w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none"
                            placeholder="Describe what changed in this version..."></textarea>
                    </div>
                </div>
            </div>

            <template #footer>
                <div class="flex items-center gap-3 w-full">
                    <Button variant="ghost" @click="showCommitDialog = false" class="gap-1.5">
                        <Icon name="X" class="w-4 h-4" />
                        Cancel
                    </Button>
                    <div class="flex-1"></div>
                    <Button @click="createVersion" :disabled="!commitMessage.trim() || isLoading" class="gap-2 px-5">
                        <Icon :name="isLoading ? 'Loader2' : 'Save'"
                            :class="isLoading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'" />
                        {{ isLoading ? 'Saving...' : 'Save Version' }}
                    </Button>
                </div>
            </template>
        </Dialog>

        <!-- Progress Overlay - Enhanced Design -->
        <Teleport to="body">
            <Transition name="fade">
                <div v-if="showProgressOverlay"
                    class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center">
                    <div
                        class="bg-card border border-border/50 rounded-2xl p-8 w-full max-w-md shadow-2xl relative overflow-hidden">
                        <!-- Background decoration -->
                        <div class="absolute inset-0 overflow-hidden pointer-events-none">
                            <div class="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl"></div>
                            <div class="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl">
                            </div>
                        </div>

                        <!-- Content -->
                        <div class="relative">
                            <!-- Header -->
                            <div class="flex items-center gap-4 mb-8">
                                <div
                                    class="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 relative">
                                    <Icon name="GitBranch" class="w-6 h-6 text-primary" />
                                    <div
                                        class="absolute inset-0 rounded-2xl border border-primary/30 animate-ping opacity-30">
                                    </div>
                                </div>
                                <div>
                                    <h3 class="text-lg font-semibold">{{ progressTitle }}</h3>
                                    <p class="text-sm text-muted-foreground">{{ progressMessage }}</p>
                                </div>
                            </div>

                            <!-- Progress Bar -->
                            <div class="mb-6">
                                <div class="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                                    <div class="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-500 ease-out"
                                        :style="{ width: `${((progressStep + 1) / progressSteps.length) * 100}%` }">
                                    </div>
                                </div>
                                <div class="flex justify-between mt-2 text-xs text-muted-foreground">
                                    <span>Step {{ progressStep + 1 }} of {{ progressSteps.length }}</span>
                                    <span>{{ Math.round(((progressStep + 1) / progressSteps.length) * 100) }}%</span>
                                </div>
                            </div>

                            <!-- Progress Steps -->
                            <div class="space-y-3">
                                <div v-for="(step, idx) in progressSteps" :key="idx"
                                    class="flex items-center gap-3 text-sm transition-all duration-300"
                                    :class="idx <= progressStep ? 'opacity-100' : 'opacity-40'">
                                    <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300"
                                        :class="idx < progressStep
                                            ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                                            : idx === progressStep
                                                ? 'bg-primary/20 text-primary border border-primary/30'
                                                : 'bg-muted/50 text-muted-foreground border border-border/30'">
                                        <svg v-if="idx < progressStep" class="w-3.5 h-3.5" viewBox="0 0 24 24"
                                            fill="none" stroke="currentColor" stroke-width="3">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                        <Icon v-else-if="idx === progressStep" name="Loader2"
                                            class="w-3.5 h-3.5 animate-spin" />
                                        <span v-else class="text-xs font-medium">{{ idx + 1 }}</span>
                                    </div>
                                    <span class="flex-1"
                                        :class="idx <= progressStep ? 'text-foreground font-medium' : 'text-muted-foreground'">
                                        {{ step }}
                                    </span>
                                    <Icon v-if="idx < progressStep" name="Check" class="w-4 h-4 text-emerald-500" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
/* Custom scrollbar for modern look */
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: hsl(var(--border));
    border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--muted-foreground) / 0.3);
}

/* Expand transition */
.expand-enter-active,
.expand-leave-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
    max-height: 500px;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* Slide fade for timeline items */
.slide-fade-enter-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-fade-leave-active {
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-fade-enter-from {
    opacity: 0;
    transform: translateX(-10px);
}

.slide-fade-leave-to {
    opacity: 0;
    transform: translateX(10px);
}

/* List transitions */
.list-enter-active,
.list-leave-active {
    transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}

.list-move {
    transition: transform 0.3s ease;
}

/* Subtle pulse animation for active elements */
@keyframes subtle-pulse {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.7;
    }
}

.animate-subtle-pulse {
    animation: subtle-pulse 2s ease-in-out infinite;
}

/* Gradient text effect */
.gradient-text {
    background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}
</style>
