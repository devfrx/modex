<script setup lang="ts">
import { ref, reactive } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import LoadingOverlay from '@/components/ui/LoadingOverlay.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import BulkActionBar from '@/components/ui/BulkActionBar.vue'
import { useToast } from '@/composables/useToast'
import {
    Play, Settings, Download, Trash2, Plus, Search, Check, X, AlertCircle,
    ArrowUpCircle, Layers, Sparkles, RefreshCw, Eye, Edit, Copy, ExternalLink,
    Folder, FileCode, Globe, GitBranch, Users, Clock, Heart, Star, Zap
} from 'lucide-vue-next'

// State for testing components
const activeSection = ref<string>('buttons')

// Dialog state
const showDialog = ref(false)
const showConfirmDialog = ref(false)

// Toast - using proper composable
const toast = useToast()

// Loading state
const isLoading = ref(false)

// Input state
const inputValue = ref('')
const inputDisabled = ref(false)

// BulkActionBar state
const showBulkBar = ref(false)
const selectedCount = ref(5)

// Toggle loading demo
const toggleLoading = () => {
    isLoading.value = true
    setTimeout(() => {
        isLoading.value = false
    }, 2000)
}

const sections = [
    { id: 'buttons', label: 'Buttons', icon: Play },
    { id: 'inputs', label: 'Inputs', icon: Edit },
    { id: 'dialogs', label: 'Dialogs', icon: Layers },
    { id: 'toasts', label: 'Toasts', icon: AlertCircle },
    { id: 'states', label: 'States', icon: Zap },
    { id: 'badges', label: 'Badges', icon: Star },
    { id: 'cards', label: 'Cards', icon: Folder },
    { id: 'colors', label: 'Colors', icon: Sparkles },
]
</script>

<template>
    <div class="h-full flex flex-col bg-background overflow-hidden">
        <!-- Header -->
        <div class="shrink-0 border-b border-border/50 bg-card/50 backdrop-blur-sm">
            <div class="px-6 py-4 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                        <Zap class="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 class="text-lg font-semibold">Dev Playground</h1>
                        <p class="text-sm text-muted-foreground">Component testing & development</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span class="px-2 py-1 rounded-md bg-amber-500/15 text-amber-500 font-medium">DEV ONLY</span>
                </div>
            </div>

            <!-- Section Nav -->
            <div class="px-6 pb-3 flex items-center gap-1 overflow-x-auto scrollbar-hide">
                <button v-for="section in sections" :key="section.id" @click="activeSection = section.id"
                    class="px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-all duration-150 whitespace-nowrap"
                    :class="activeSection === section.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'">
                    <component :is="section.icon" class="w-3.5 h-3.5" />
                    {{ section.label }}
                </button>
            </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-auto p-6 space-y-8">

            <!-- Buttons Section -->
            <section v-if="activeSection === 'buttons'" class="space-y-6">
                <h2 class="text-xl font-semibold">Buttons</h2>

                <!-- Primary Buttons -->
                <div class="space-y-3">
                    <h3 class="text-sm font-medium text-muted-foreground">Primary Variants</h3>
                    <div class="flex flex-wrap items-center gap-3">
                        <Button variant="default">Default</Button>
                        <Button variant="default" size="sm">Small</Button>
                        <Button variant="default" size="lg">Large</Button>
                        <Button variant="default" disabled>Disabled</Button>
                        <Button variant="default">
                            <Play class="w-4 h-4 mr-2" />
                            With Icon
                        </Button>
                    </div>
                </div>

                <!-- Secondary Buttons -->
                <div class="space-y-3">
                    <h3 class="text-sm font-medium text-muted-foreground">Secondary & Ghost</h3>
                    <div class="flex flex-wrap items-center gap-3">
                        <Button variant="secondary">Secondary</Button>
                        <Button variant="outline">Outline</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button variant="link">Link</Button>
                    </div>
                </div>

                <!-- Destructive -->
                <div class="space-y-3">
                    <h3 class="text-sm font-medium text-muted-foreground">Destructive</h3>
                    <div class="flex flex-wrap items-center gap-3">
                        <Button variant="destructive">Destructive</Button>
                        <Button variant="destructive">
                            <Trash2 class="w-4 h-4 mr-2" />
                            Delete
                        </Button>
                    </div>
                </div>

                <!-- Icon Buttons -->
                <div class="space-y-3">
                    <h3 class="text-sm font-medium text-muted-foreground">Icon Only</h3>
                    <div class="flex flex-wrap items-center gap-3">
                        <Button variant="ghost" size="icon">
                            <Settings class="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                            <Search class="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                            <Plus class="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon">
                            <RefreshCw class="w-4 h-4" />
                        </Button>
                        <Button variant="default" size="icon">
                            <Download class="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </section>

            <!-- Inputs Section -->
            <section v-if="activeSection === 'inputs'" class="space-y-6">
                <h2 class="text-xl font-semibold">Inputs</h2>

                <div class="max-w-md space-y-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium">Default Input</label>
                        <Input v-model="inputValue" placeholder="Type something..." />
                    </div>

                    <div class="space-y-2">
                        <label class="text-sm font-medium">With Icon (Search)</label>
                        <div class="relative">
                            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input v-model="inputValue" placeholder="Search..." class="pl-10" />
                        </div>
                    </div>

                    <div class="space-y-2">
                        <label class="text-sm font-medium">Disabled</label>
                        <Input v-model="inputValue" placeholder="Disabled input" disabled />
                    </div>

                    <div class="space-y-2">
                        <label class="text-sm font-medium">With Error State</label>
                        <Input v-model="inputValue" placeholder="Error state"
                            class="border-red-500/50 focus:ring-red-500/30" />
                        <p class="text-xs text-red-500">This field is required</p>
                    </div>
                </div>
            </section>

            <!-- Dialogs Section -->
            <section v-if="activeSection === 'dialogs'" class="space-y-6">
                <h2 class="text-xl font-semibold">Dialogs</h2>

                <div class="flex flex-wrap gap-3">
                    <Button @click="showDialog = true">Open Dialog</Button>
                    <Button variant="destructive" @click="showConfirmDialog = true">Open Confirm Dialog</Button>
                    <Button variant="secondary" @click="toggleLoading">Show Loading Overlay</Button>
                </div>

                <Dialog :open="showDialog" @close="showDialog = false" title="Example Dialog" size="md">
                    <div class="space-y-4">
                        <p class="text-muted-foreground">
                            This is an example dialog with some content. You can put any content here.
                        </p>
                        <div class="flex justify-end gap-3">
                            <Button variant="ghost" @click="showDialog = false">Cancel</Button>
                            <Button
                                @click="showDialog = false; toast.success('Done!', 'Action completed!')">Confirm</Button>
                        </div>
                    </div>
                </Dialog>

                <ConfirmDialog :open="showConfirmDialog" title="Delete Item?"
                    message="Are you sure you want to delete this item? This action cannot be undone."
                    confirmText="Delete" confirmVariant="destructive"
                    @confirm="showConfirmDialog = false; toast.error('Deleted!', 'Item deleted')"
                    @cancel="showConfirmDialog = false" />

                <LoadingOverlay :open="isLoading" message="Loading..." />
            </section>

            <!-- Toasts Section -->
            <section v-if="activeSection === 'toasts'" class="space-y-6">
                <h2 class="text-xl font-semibold">Toasts</h2>

                <p class="text-sm text-muted-foreground">
                    Toasts are displayed using the global toast system. Click buttons to trigger toasts in the app's
                    notification area.
                </p>

                <div class="flex flex-wrap gap-3">
                    <Button @click="toast.success('Success!', 'Operation completed successfully')">
                        <Check class="w-4 h-4 mr-2" />
                        Success Toast
                    </Button>
                    <Button variant="destructive" @click="toast.error('Error!', 'Something went wrong')">
                        <X class="w-4 h-4 mr-2" />
                        Error Toast
                    </Button>
                    <Button variant="secondary" @click="toast.warning('Warning!', 'Please check your input')">
                        <AlertCircle class="w-4 h-4 mr-2" />
                        Warning Toast
                    </Button>
                    <Button variant="outline" @click="toast.info('Info', 'Here is some information')">
                        <AlertCircle class="w-4 h-4 mr-2" />
                        Info Toast
                    </Button>
                </div>
            </section>

            <!-- States Section -->
            <section v-if="activeSection === 'states'" class="space-y-6">
                <h2 class="text-xl font-semibold">States & Empty States</h2>

                <div class="grid md:grid-cols-2 gap-6">
                    <div class="p-6 border border-border/50 rounded-lg bg-card/50">
                        <EmptyState title="No mods found" description="Start by adding some mods to your modpack."
                            icon="package">
                            <Button>
                                <Plus class="w-4 h-4 mr-2" />
                                Add Mods
                            </Button>
                        </EmptyState>
                    </div>

                    <div class="p-6 border border-border/50 rounded-lg bg-card/50">
                        <EmptyState title="Search returned empty"
                            description="Try a different search term or check your filters." icon="search" />
                    </div>
                </div>

                <!-- Bulk Action Bar Demo -->
                <div class="space-y-3">
                    <h3 class="text-sm font-medium text-muted-foreground">Bulk Action Bar</h3>
                    <div class="flex items-center gap-3">
                        <Button variant="secondary" @click="showBulkBar = !showBulkBar">
                            {{ showBulkBar ? 'Hide' : 'Show' }} Bulk Bar
                        </Button>
                        <span class="text-sm text-muted-foreground">{{ selectedCount }} items selected</span>
                    </div>
                    <BulkActionBar v-if="showBulkBar" :count="selectedCount" label="items selected"
                        @clear="showBulkBar = false">
                        <Button variant="ghost" size="sm">
                            <Check class="w-4 h-4 mr-2" />
                            Enable
                        </Button>
                        <Button variant="ghost" size="sm">
                            <X class="w-4 h-4 mr-2" />
                            Disable
                        </Button>
                        <Button variant="destructive" size="sm">
                            <Trash2 class="w-4 h-4 mr-2" />
                            Remove
                        </Button>
                    </BulkActionBar>
                </div>
            </section>

            <!-- Badges Section -->
            <section v-if="activeSection === 'badges'" class="space-y-6">
                <h2 class="text-xl font-semibold">Badges & Tags</h2>

                <div class="space-y-4">
                    <div class="flex flex-wrap gap-2">
                        <span class="px-2 py-1 rounded-md bg-primary/15 text-primary text-xs font-medium">Primary</span>
                        <span
                            class="px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs font-medium">Muted</span>
                        <span class="px-2 py-1 rounded-md bg-red-500/15 text-red-500 text-xs font-medium">Error</span>
                        <span
                            class="px-2 py-1 rounded-md bg-amber-500/15 text-amber-500 text-xs font-medium">Warning</span>
                        <span class="px-2 py-1 rounded-md bg-blue-500/15 text-blue-500 text-xs font-medium">Info</span>
                    </div>

                    <div class="flex flex-wrap gap-2">
                        <span
                            class="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">NEW</span>
                        <span class="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-medium">HOT</span>
                        <span
                            class="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-medium">BETA</span>
                        <span
                            class="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">v1.0.0</span>
                    </div>

                    <div class="flex flex-wrap gap-2">
                        <span
                            class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/15 text-primary text-xs font-medium">
                            <Check class="w-3 h-3" />
                            Compatible
                        </span>
                        <span
                            class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/15 text-red-500 text-xs font-medium">
                            <X class="w-3 h-3" />
                            Incompatible
                        </span>
                        <span
                            class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 text-amber-500 text-xs font-medium animate-pulse">
                            <RefreshCw class="w-3 h-3" />
                            Updating
                        </span>
                    </div>
                </div>
            </section>

            <!-- Cards Section -->
            <section v-if="activeSection === 'cards'" class="space-y-6">
                <h2 class="text-xl font-semibold">Cards</h2>

                <div class="grid md:grid-cols-3 gap-4">
                    <!-- Basic Card -->
                    <div
                        class="p-4 rounded-lg border border-border/50 bg-card hover:border-primary/30 transition-all duration-150">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                                <Layers class="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h4 class="font-medium">Card Title</h4>
                                <p class="text-xs text-muted-foreground">Subtitle</p>
                            </div>
                        </div>
                        <p class="text-sm text-muted-foreground">This is a basic card with an icon and some content.</p>
                    </div>

                    <!-- Interactive Card -->
                    <div
                        class="p-4 rounded-lg border border-border/50 bg-card hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-150 cursor-pointer">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
                                <Star class="w-5 h-5 text-amber-500" />
                            </div>
                            <div>
                                <h4 class="font-medium">Interactive</h4>
                                <p class="text-xs text-muted-foreground">Hover me!</p>
                            </div>
                        </div>
                        <p class="text-sm text-muted-foreground">This card has hover effects and looks clickable.</p>
                    </div>

                    <!-- Stats Card -->
                    <div class="p-4 rounded-lg border border-border/50 bg-card">
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-sm text-muted-foreground">Total Mods</span>
                            <Layers class="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div class="text-3xl font-bold">1,234</div>
                        <p class="text-xs text-primary mt-1 flex items-center gap-1">
                            <ArrowUpCircle class="w-3 h-3" />
                            +12% from last week
                        </p>
                    </div>
                </div>
            </section>

            <!-- Colors Section -->
            <section v-if="activeSection === 'colors'" class="space-y-6">
                <h2 class="text-xl font-semibold">Color Palette</h2>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="space-y-2">
                        <div class="h-20 rounded-lg bg-primary"></div>
                        <p class="text-xs font-medium">Primary</p>
                        <p class="text-[10px] text-muted-foreground font-mono">hsl(var(--primary))</p>
                    </div>
                    <div class="space-y-2">
                        <div class="h-20 rounded-lg bg-muted border border-border"></div>
                        <p class="text-xs font-medium">Muted</p>
                        <p class="text-[10px] text-muted-foreground font-mono">hsl(var(--muted))</p>
                    </div>
                    <div class="space-y-2">
                        <div class="h-20 rounded-lg bg-card border border-border"></div>
                        <p class="text-xs font-medium">Card</p>
                        <p class="text-[10px] text-muted-foreground font-mono">hsl(var(--card))</p>
                    </div>
                    <div class="space-y-2">
                        <div class="h-20 rounded-lg bg-accent border border-border"></div>
                        <p class="text-xs font-medium">Accent</p>
                        <p class="text-[10px] text-muted-foreground font-mono">hsl(var(--accent))</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div class="space-y-2">
                        <div class="h-12 rounded-lg bg-red-500"></div>
                        <p class="text-xs font-medium">Red / Destructive</p>
                    </div>
                    <div class="space-y-2">
                        <div class="h-12 rounded-lg bg-amber-500"></div>
                        <p class="text-xs font-medium">Amber / Warning</p>
                    </div>
                    <div class="space-y-2">
                        <div class="h-12 rounded-lg bg-blue-500"></div>
                        <p class="text-xs font-medium">Blue / Info</p>
                    </div>
                    <div class="space-y-2">
                        <div class="h-12 rounded-lg bg-primary"></div>
                        <p class="text-xs font-medium">Primary (Green)</p>
                    </div>
                    <div class="space-y-2">
                        <div class="h-12 rounded-lg bg-foreground"></div>
                        <p class="text-xs font-medium">Foreground</p>
                    </div>
                </div>

                <!-- Text Colors -->
                <div class="space-y-3">
                    <h3 class="text-sm font-medium text-muted-foreground">Text Colors</h3>
                    <div class="space-y-2">
                        <p class="text-foreground">text-foreground - Main text color</p>
                        <p class="text-muted-foreground">text-muted-foreground - Secondary text</p>
                        <p class="text-primary">text-primary - Primary accent</p>
                        <p class="text-red-500">text-red-500 - Error/destructive</p>
                        <p class="text-amber-500">text-amber-500 - Warning</p>
                        <p class="text-blue-500">text-blue-500 - Info</p>
                    </div>
                </div>
            </section>

        </div>
    </div>
</template>

<style scoped>
.scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
</style>
