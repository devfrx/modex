<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import Icon from "@/components/ui/Icon.vue";

const toast = useToast();

// State
const isCheckingUpdate = ref(false);
const isDownloading = ref(false);
const downloadProgress = ref(0);
const downloadSpeed = ref("");
const updateAvailable = ref(false);
const updateDownloaded = ref(false);
const updateInfo = ref<{
    version: string;
    releaseNotes?: string;
    releaseUrl?: string;
    canAutoUpdate?: boolean;
} | null>(null);
const showUpdateDialog = ref(false);
const currentVersion = ref("");
const updateError = ref<string | null>(null);

// Cleanup functions for event listeners
const cleanupFunctions: (() => void)[] = [];

onMounted(() => {
    // Setup event listeners
    cleanupFunctions.push(
        window.api.updates.onUpdateChecking(() => {
            isCheckingUpdate.value = true;
        })
    );

    cleanupFunctions.push(
        window.api.updates.onUpdateAvailable((info) => {
            updateAvailable.value = true;
            updateInfo.value = {
                version: info.version,
                releaseNotes: info.releaseNotes,
                canAutoUpdate: true,
            };
            showUpdateDialog.value = true;
        })
    );

    cleanupFunctions.push(
        window.api.updates.onUpdateNotAvailable((info) => {
            isCheckingUpdate.value = false;
            currentVersion.value = info.version;
        })
    );

    cleanupFunctions.push(
        window.api.updates.onDownloadProgress((progress) => {
            isDownloading.value = true;
            downloadProgress.value = Math.round(progress.percent);
            // Format speed
            const mbps = progress.bytesPerSecond / (1024 * 1024);
            downloadSpeed.value = mbps >= 1 ? `${mbps.toFixed(1)} MB/s` : `${(progress.bytesPerSecond / 1024).toFixed(0)} KB/s`;
        })
    );

    cleanupFunctions.push(
        window.api.updates.onUpdateDownloaded((info) => {
            isDownloading.value = false;
            updateDownloaded.value = true;
            updateInfo.value = {
                version: info.version,
                releaseNotes: info.releaseNotes,
                canAutoUpdate: true,
            };
            toast.success(
                "Update Ready!",
                `Version ${info.version} is ready to install. Click to restart.`,
                10000
            );
        })
    );

    cleanupFunctions.push(
        window.api.updates.onUpdateError((error) => {
            // AutoUpdater errors are logged but not shown to user
            // The fallback download method will handle it
            console.log("[UpdateManager] AutoUpdater error (will use fallback):", error.message);
        })
    );
});

onUnmounted(() => {
    // Cleanup all event listeners
    cleanupFunctions.forEach((cleanup) => cleanup());
});

async function checkForUpdates() {
    isCheckingUpdate.value = true;
    updateError.value = null;

    try {
        const result = await window.api.updates.checkAppUpdate();
        currentVersion.value = result.currentVersion || "";

        if (result.error) {
            toast.error("Update check failed", result.error);
            updateError.value = result.error;
        } else if (result.hasUpdate) {
            updateAvailable.value = true;
            updateInfo.value = {
                version: result.latestVersion || "",
                releaseNotes: result.releaseNotes,
                releaseUrl: result.releaseUrl,
                canAutoUpdate: result.canAutoUpdate,
            };
            showUpdateDialog.value = true;
        } else if (result.noReleases) {
            toast.success("You're up to date", `Running v${result.currentVersion} (development build).`);
        } else {
            toast.success("You're up to date", `Running the latest version (v${result.currentVersion}).`);
        }
    } catch (error: any) {
        toast.error("Update check failed", error.message || "Could not connect to GitHub.");
        updateError.value = error.message;
    } finally {
        isCheckingUpdate.value = false;
    }
}

async function downloadUpdate() {
    if (!updateInfo.value?.canAutoUpdate) {
        // Can't auto-update (dev mode), open the release page
        if (updateInfo.value?.releaseUrl) {
            window.open(updateInfo.value.releaseUrl, "_blank");
        }
        showUpdateDialog.value = false;
        return;
    }

    isDownloading.value = true;
    downloadProgress.value = 0;
    updateError.value = null;

    try {
        const result = await window.api.updates.downloadUpdate();
        if (!result.success) {
            // Show the actual error
            toast.error("Download failed", result.error || "Unknown error");
            updateError.value = result.error || "Unknown error";
            isDownloading.value = false;
        }
        // Success case - progress and completion will be tracked via events
    } catch (error: any) {
        toast.error("Download failed", error.message || "Unknown error");
        updateError.value = error.message || "Unknown error";
        isDownloading.value = false;
    }
}

async function installUpdate() {
    try {
        await window.api.updates.installUpdate();
        // App will restart
    } catch (error: any) {
        toast.error("Install failed", error.message);
    }
}

function openReleasePage() {
    if (updateInfo.value?.releaseUrl) {
        window.open(updateInfo.value.releaseUrl, "_blank");
    }
}

function closeDialog() {
    showUpdateDialog.value = false;
}

// Expose methods for parent components
defineExpose({
    checkForUpdates,
    isCheckingUpdate,
    updateAvailable,
    updateDownloaded,
    isDownloading,
    downloadProgress,
});
</script>

<template>
    <!-- Update Check Button -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
        <div>
            <div class="font-medium">App Updates</div>
            <div class="text-sm text-muted-foreground">
                <template v-if="updateDownloaded">
                    <span class="text-green-500">Update ready to install!</span>
                </template>
                <template v-else-if="isDownloading">
                    Downloading update... {{ downloadProgress }}%
                </template>
                <template v-else-if="updateAvailable">
                    <span class="text-primary">New version available!</span>
                </template>
                <template v-else>
                    Check for new versions
                </template>
            </div>
        </div>

        <div class="flex gap-2">
            <template v-if="updateDownloaded">
                <Button variant="default" @click="installUpdate" class="gap-2">
                    <Icon name="RotateCcw" class="w-4 h-4" />
                    Restart & Install
                </Button>
            </template>
            <template v-else-if="isDownloading">
                <div class="flex items-center gap-3">
                    <div class="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div class="h-full bg-primary transition-all duration-300"
                            :style="{ width: `${downloadProgress}%` }" />
                    </div>
                    <span class="text-sm text-muted-foreground">{{ downloadSpeed }}</span>
                </div>
            </template>
            <template v-else-if="updateAvailable">
                <Button variant="default" @click="showUpdateDialog = true" class="gap-2">
                    <Icon name="Download" class="w-4 h-4" />
                    View Update
                </Button>
            </template>
            <template v-else>
                <Button variant="outline" @click="checkForUpdates" :disabled="isCheckingUpdate"
                    class="gap-2 w-full sm:w-auto">
                    <Icon name="RefreshCw" class="w-4 h-4" :class="{ 'animate-spin': isCheckingUpdate }" />
                    {{ isCheckingUpdate ? "Checking..." : "Check Now" }}
                </Button>
            </template>
        </div>
    </div>

    <!-- Update Dialog -->
    <Dialog :open="showUpdateDialog" @close="closeDialog" title="Update Available">
        <template #icon>
            <div class="p-3 rounded-xl bg-primary/10">
                <Icon name="Sparkles" class="w-6 h-6 text-primary" />
            </div>
        </template>

        <div class="space-y-4">
            <!-- Version Info -->
            <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div class="text-sm text-muted-foreground">Current Version</div>
                <div class="font-medium">v{{ currentVersion }}</div>
            </div>

            <div class="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                <div class="text-sm text-muted-foreground">New Version</div>
                <div class="font-medium text-primary">v{{ updateInfo?.version }}</div>
            </div>

            <!-- Release Notes -->
            <div v-if="updateInfo?.releaseNotes" class="space-y-2">
                <div class="text-sm font-medium">What's New</div>
                <div class="text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg max-h-48 overflow-y-auto prose prose-sm prose-invert"
                    v-html="updateInfo.releaseNotes" />
            </div>

            <!-- Auto-update notice -->
            <div v-if="!updateInfo?.canAutoUpdate"
                class="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <Icon name="AlertCircle" class="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div class="text-sm text-muted-foreground">
                    Auto-update is not available in development mode. Click the button below to download the update
                    manually.
                </div>
            </div>

            <!-- Download Progress -->
            <div v-if="isDownloading" class="space-y-2">
                <div class="flex justify-between text-sm">
                    <span>Downloading...</span>
                    <span>{{ downloadProgress }}%</span>
                </div>
                <div class="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div class="h-full bg-primary transition-all duration-300"
                        :style="{ width: `${downloadProgress}%` }" />
                </div>
                <div class="text-xs text-muted-foreground text-center">{{ downloadSpeed }}</div>
            </div>

            <!-- Error -->
            <div v-if="updateError"
                class="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <Icon name="AlertCircle" class="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <div class="text-sm text-destructive">{{ updateError }}</div>
            </div>
        </div>

        <template #footer>
            <div class="flex gap-3">
                <Button variant="ghost" @click="closeDialog">
                    Later
                </Button>
                <Button variant="ghost" @click="openReleasePage" class="gap-2">
                    <Icon name="ExternalLink" class="w-4 h-4" />
                    View Release
                </Button>
                <template v-if="updateDownloaded">
                    <Button variant="default" @click="installUpdate" class="gap-2">
                        <Icon name="RotateCcw" class="w-4 h-4" />
                        Restart & Install
                    </Button>
                </template>
                <template v-else-if="!isDownloading">
                    <Button variant="default" @click="downloadUpdate" class="gap-2">
                        <Icon name="Download" class="w-4 h-4" />
                        {{ updateInfo?.canAutoUpdate ? 'Download Update' : 'Download Manually' }}
                    </Button>
                </template>
            </div>
        </template>
    </Dialog>
</template>
