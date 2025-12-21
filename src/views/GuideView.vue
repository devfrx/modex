<script setup lang="ts">
import { ref } from "vue";
import {
    BookOpen,
    Library,
    Package,
    FolderTree,
    LayoutGrid,
    Settings,
    Search,
    Download,
    Plus,
    Trash2,
    Star,
    RefreshCw,
    Upload,
    Filter,
    ChevronRight,
    Keyboard,
    HelpCircle,
    Zap,
    CheckCircle2,
    ArrowRight,
    MousePointer,
    Globe,
    ArrowLeftRight,
} from "lucide-vue-next";

const activeSection = ref("getting-started");

const sections = [
    { id: "getting-started", name: "Getting Started", icon: Zap },
    { id: "library", name: "Library", icon: Library },
    { id: "modpacks", name: "Modpacks", icon: Package },
    { id: "organize", name: "Organize", icon: FolderTree },
    { id: "sandbox", name: "Sandbox", icon: LayoutGrid },
    { id: "curseforge", name: "CurseForge Browse", icon: Globe },
    { id: "settings", name: "Settings", icon: Settings },
    { id: "shortcuts", name: "Keyboard Shortcuts", icon: Keyboard },
    { id: "faq", name: "FAQ", icon: HelpCircle },
];

const shortcuts = [
    { keys: "Ctrl + F", action: "Open search / Focus search field" },
    { keys: "Ctrl + N", action: "Create new modpack" },
    { keys: "Ctrl + I", action: "Import mods from CurseForge" },
    { keys: "Ctrl + A", action: "Select all items" },
    { keys: "Delete", action: "Delete selected items" },
    { keys: "Escape", action: "Clear selection / Close dialogs" },
    { keys: "Ctrl + Click", action: "Add/remove from selection" },
    { keys: "Shift + Click", action: "Select range of items" },
];

const faqs = [
    {
        q: "Where are my mods stored?",
        a: "ModEx uses a metadata-only architecture. Mods are stored as references to CurseForge, not as local JAR files. This keeps your library lightweight and always up-to-date.",
    },
    {
        q: "How do I play with my modpack?",
        a: "Use the Export feature to generate a modpack compatible with launchers like CurseForge App, Prism Launcher, or MultiMC. Then import the exported file into your preferred launcher.",
    },
    {
        q: "Do I need a CurseForge API key?",
        a: "Yes. ModEx requires your own CurseForge API Key to function. You can get one for free from the CurseForge Console and add it in Settings > General > API Configuration.",
    },
    {
        q: "How do I check for mod updates?",
        a: "In the Library view, click the 'Check Updates' button in the toolbar. ModEx will compare your mod versions against the latest releases on CurseForge for your game version and loader.",
    },
    {
        q: "Can I use mods from Modrinth?",
        a: "No. ModEx currently only supports CurseForge. Modrinth support is not available.",
    },
    {
        q: "What's the difference between Library and Modpacks?",
        a: "The Library is your global collection of all mods. Modpacks are curated subsets of your library organized for specific game setups (e.g., 'Performance Pack', 'Magic Mods 1.20.1').",
    },
];
</script>

<template>
    <div class="flex h-full bg-background text-foreground overflow-hidden">
        <!-- Sidebar Navigation -->
        <div class="w-64 flex-shrink-0 border-r border-border bg-card/30 flex flex-col">
            <div class="p-6 pb-4">
                <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <BookOpen class="w-6 h-6 text-primary" />
                    User Guide
                </h1>
                <p class="text-xs text-muted-foreground mt-1">Learn how to use ModEx</p>
            </div>

            <nav class="flex-1 px-3 space-y-1 overflow-y-auto">
                <button v-for="section in sections" :key="section.id" @click="activeSection = section.id"
                    class="w-full text-left px-3 py-2.5 rounded-md flex items-center gap-3 transition-all duration-200 text-sm font-medium"
                    :class="activeSection === section.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        ">
                    <component :is="section.icon" class="w-4 h-4" />
                    {{ section.name }}
                </button>
            </nav>
        </div>

        <!-- Content Area -->
        <div class="flex-1 overflow-auto bg-background">
            <div class="max-w-4xl mx-auto p-8">

                <!-- Getting Started -->
                <div v-if="activeSection === 'getting-started'" class="space-y-8">
                    <div>
                        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <Zap class="w-8 h-8 text-primary" />
                            Getting Started with ModEx
                        </h2>
                        <p class="text-muted-foreground mt-2 text-lg">
                            Welcome to ModEx, the modern Minecraft mod manager. Let's get you set up!
                        </p>
                    </div>

                    <div class="grid gap-6">
                        <div class="p-6 rounded-xl border border-border bg-card/50">
                            <div class="flex items-start gap-4">
                                <div
                                    class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                    1</div>
                                <div class="flex-1">
                                    <h3 class="text-lg font-semibold">Browse CurseForge</h3>
                                    <p class="text-muted-foreground mt-1">
                                        Go to <strong>Library</strong> and click the <strong>+ Add from
                                            CurseForge</strong> button.
                                        Search for mods, select your game version and loader (Forge, Fabric, etc.), and
                                        add mods to your library.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="p-6 rounded-xl border border-border bg-card/50">
                            <div class="flex items-start gap-4">
                                <div
                                    class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                    2</div>
                                <div class="flex-1">
                                    <h3 class="text-lg font-semibold">Create a Modpack</h3>
                                    <p class="text-muted-foreground mt-1">
                                        Navigate to <strong>Modpacks</strong> and click <strong>+ New Modpack</strong>.
                                        Give it a name, select your Minecraft version and loader, then add mods from
                                        your library.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="p-6 rounded-xl border border-border bg-card/50">
                            <div class="flex items-start gap-4">
                                <div
                                    class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                    3</div>
                                <div class="flex-1">
                                    <h3 class="text-lg font-semibold">Export & Play</h3>
                                    <p class="text-muted-foreground mt-1">
                                        When your modpack is ready, use the <strong>Export</strong> button to create a
                                        file
                                        compatible with your favorite launcher (CurseForge App, Prism Launcher, etc.).
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="p-6 rounded-xl border border-primary/30 bg-primary/5">
                        <div class="flex items-start gap-3">
                            <CheckCircle2 class="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                            <div>
                                <h3 class="font-semibold text-primary">Pro Tip</h3>
                                <p class="text-sm text-muted-foreground mt-1">
                                    Use the <strong>Organize</strong> view to create folders and categorize your mods
                                    (e.g., "Performance", "World Gen", "Magic"). This makes it easier to build themed
                                    modpacks later!
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Library Section -->
                <div v-if="activeSection === 'library'" class="space-y-8">
                    <div>
                        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <Library class="w-8 h-8 text-primary" />
                            Library
                        </h2>
                        <p class="text-muted-foreground mt-2">
                            Your global collection of all mods. The Library is the central hub where you manage every
                            mod you've added.
                        </p>
                    </div>

                    <div class="space-y-6">
                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold flex items-center gap-2">
                                <Plus class="w-4 h-4 text-primary" />
                                Adding Mods
                            </h3>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Click <strong>"+ Add from CurseForge"</strong> to open the browse dialog
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Set your preferred <strong>Game Version</strong> and <strong>Loader</strong> filters
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Search or browse popular mods, then click <strong>Download</strong> or expand to
                                    select a specific version
                                </li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold flex items-center gap-2">
                                <Filter class="w-4 h-4 text-primary" />
                                Filtering & Searching
                            </h3>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Use the <strong>search bar</strong> to find mods by name
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Filter by <strong>Loader</strong> (Forge, Fabric, etc.) using the dropdown
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Toggle <strong>Favorites Only</strong> to show starred mods
                                </li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold flex items-center gap-2">
                                <RefreshCw class="w-4 h-4 text-primary" />
                                Checking for Updates
                            </h3>
                            <p class="text-sm text-muted-foreground">
                                Click the <strong>Check Updates</strong> button in the toolbar. ModEx compares your
                                installed mod versions
                                against the latest <strong>release</strong> versions on CurseForge, matching your exact
                                game version and loader.
                                Beta and alpha versions are ignored unless you explicitly installed them.
                            </p>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold flex items-center gap-2">
                                <MousePointer class="w-4 h-4 text-primary" />
                                Bulk Actions
                            </h3>
                            <p class="text-sm text-muted-foreground">
                                Select multiple mods using <strong>Ctrl+Click</strong> or <strong>Shift+Click</strong>.
                                A toolbar will appear allowing you to: add to modpack, move to folder, or delete
                                selected mods.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Modpacks Section -->
                <div v-if="activeSection === 'modpacks'" class="space-y-8">
                    <div>
                        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <Package class="w-8 h-8 text-primary" />
                            Modpacks
                        </h2>
                        <p class="text-muted-foreground mt-2">
                            Create curated collections of mods for specific game setups.
                        </p>
                    </div>

                    <div class="space-y-6">
                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold flex items-center gap-2">
                                <Plus class="w-4 h-4 text-primary" />
                                Creating a Modpack
                            </h3>
                            <ol class="space-y-2 text-sm text-muted-foreground ml-6 list-decimal list-inside">
                                <li>Click <strong>"+ New Modpack"</strong> button</li>
                                <li>Enter a name and optional description</li>
                                <li>Select your <strong>Minecraft version</strong> (e.g., 1.20.1)</li>
                                <li>Choose your <strong>Loader</strong> (Forge, Fabric, NeoForge, Quilt)</li>
                                <li>Click Create to save your empty modpack</li>
                            </ol>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold flex items-center gap-2">
                                <Zap class="w-4 h-4 text-primary" />
                                Modpack Analysis
                            </h3>
                            <p class="text-sm text-muted-foreground">
                                ModEx includes a powerful analysis tool to help you optimize your modpacks.
                                Click the <strong>Analyze</strong> button in any modpack to view:
                            </p>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>RAM Usage Estimation:</strong> Predicted memory requirements based on mod
                                    count and types.
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Performance Impact:</strong> Identification of heavy mods and potential
                                    bottlenecks.
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Conflict Detection:</strong> Warnings about known incompatible mod
                                    combinations.
                                </li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold flex items-center gap-2">
                                <Download class="w-4 h-4 text-primary" />
                                Adding Mods to a Modpack
                            </h3>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Open the modpack by clicking on it
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Click <strong>"+ Add Mods"</strong> to select from your library
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Or click <strong>"+ Browse CurseForge"</strong> to add new mods directly
                                </li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold flex items-center gap-2">
                                <Upload class="w-4 h-4 text-primary" />
                                Exporting a Modpack
                            </h3>
                            <p class="text-sm text-muted-foreground">
                                Click the <strong>Export</strong> button on your modpack to generate a file compatible
                                with external launchers:
                            </p>
                            <ul class="space-y-1 text-sm text-muted-foreground ml-6 mt-2">
                                <li>• <strong>CurseForge format</strong> - For CurseForge App</li>
                                <li>• <strong>Modrinth format</strong> - For Prism Launcher, ATLauncher</li>
                                <li>• <strong>Generic ZIP</strong> - Manual installation</li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold flex items-center gap-2">
                                <RefreshCw class="w-4 h-4 text-primary" />
                                Dependency Analysis
                            </h3>
                            <p class="text-sm text-muted-foreground">
                                ModEx can analyze your modpack for missing dependencies. Click
                                <strong>"Analyze"</strong> to:
                            </p>
                            <ul class="space-y-1 text-sm text-muted-foreground ml-6 mt-2">
                                <li>• Find missing required mods (e.g., library mods)</li>
                                <li>• Detect potential conflicts between mods</li>
                                <li>• One-click install missing dependencies</li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold flex items-center gap-2">
                                <ArrowLeftRight class="w-4 h-4 text-primary" />
                                Comparing Modpacks
                            </h3>
                            <p class="text-sm text-muted-foreground">
                                You can compare two modpacks to see what's different between them.
                            </p>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6 mt-2">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Click the <strong>Compare</strong> button in the Modpacks toolbar
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Select the <strong>Source</strong> and <strong>Target</strong> modpacks
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    View a detailed diff of added, removed, and version-changed mods
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                <!-- Organize Section -->
                <div v-if="activeSection === 'organize'" class="space-y-8">
                    <div>
                        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <FolderTree class="w-8 h-8 text-primary" />
                            Organize
                        </h2>
                        <p class="text-muted-foreground mt-2">
                            Create a folder hierarchy to categorize your mods for easy navigation.
                        </p>
                    </div>

                    <div class="space-y-6">
                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold">How Folders Work</h3>
                            <p class="text-sm text-muted-foreground">
                                Folders are a visual organization tool. A mod can be in <strong>one folder</strong> but
                                still
                                appear in <strong>multiple modpacks</strong>. Think of folders as categories, not
                                containers.
                            </p>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold">Creating Folders</h3>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Click <strong>"+ New Folder"</strong> in the Organize view
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Drag and drop folders to create nested hierarchies
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    Right-click a folder to rename or delete it
                                </li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold">Moving Mods</h3>
                            <p class="text-sm text-muted-foreground">
                                Drag mods from the list on the right into folders on the left.
                                You can also select multiple mods and move them at once.
                            </p>
                        </div>

                        <div class="p-5 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                            <h3 class="font-semibold text-primary">Suggested Folder Structure</h3>
                            <ul class="space-y-1 text-sm text-muted-foreground ml-4">
                                <li>📁 <strong>Performance</strong> - Sodium, Lithium, FerriteCore</li>
                                <li>📁 <strong>World Generation</strong> - Terralith, Biomes O' Plenty</li>
                                <li>📁 <strong>Technology</strong> - Create, Mekanism, Applied Energistics</li>
                                <li>📁 <strong>Magic</strong> - Botania, Ars Nouveau, Thaumcraft</li>
                                <li>📁 <strong>Quality of Life</strong> - JEI, WAILA, Inventory Tweaks</li>
                                <li>📁 <strong>Libraries</strong> - Architectury, Cloth Config, GeckoLib</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <!-- Sandbox Section -->
                <div v-if="activeSection === 'sandbox'" class="space-y-8">
                    <div>
                        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <LayoutGrid class="w-8 h-8 text-primary" />
                            Sandbox
                        </h2>
                        <p class="text-muted-foreground mt-2">
                            A visual graph view of your entire mod ecosystem.
                        </p>
                    </div>

                    <div class="space-y-6">
                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold">What is Sandbox?</h3>
                            <p class="text-sm text-muted-foreground">
                                Sandbox displays your mods, modpacks, and folders as interconnected nodes in a graph.
                                This helps you visualize relationships and dependencies at a glance.
                            </p>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold">Navigation</h3>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Pan</strong>: Click and drag on empty space
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Zoom</strong>: Scroll wheel or use the +/- buttons
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Focus</strong>: Click a node to center on it
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Filter</strong>: Use the top bar to show/hide Folders, Mods, or Modpacks
                                </li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold">Node Colors</h3>
                            <ul class="space-y-2 text-sm text-muted-foreground">
                                <li class="flex items-center gap-2">
                                    <span class="w-3 h-3 rounded-full bg-amber-500"></span>
                                    <strong>Amber</strong> - Folders
                                </li>
                                <li class="flex items-center gap-2">
                                    <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
                                    <strong>Green</strong> - Mods
                                </li>
                                <li class="flex items-center gap-2">
                                    <span class="w-3 h-3 rounded-full bg-violet-500"></span>
                                    <strong>Purple</strong> - Modpacks
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                <!-- CurseForge Browse Section -->
                <div v-if="activeSection === 'curseforge'" class="space-y-8">
                    <div>
                        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <Globe class="w-8 h-8 text-primary" />
                            CurseForge Browse
                        </h2>
                        <p class="text-muted-foreground mt-2">
                            Search and download mods directly from CurseForge.
                        </p>
                    </div>

                    <div class="space-y-6">
                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold">Using Filters</h3>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Game Version</strong>: Filter mods compatible with a specific Minecraft
                                    version
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Loader</strong>: Show only mods for Forge, Fabric, Quilt, or NeoForge
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Category</strong>: Browse by category (World Gen, Technology, etc.)
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Release Type</strong>: Toggle Release, Beta, Alpha visibility
                                </li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold">Downloading Mods</h3>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Quick Download</strong>: Click the download icon to add the latest release
                                    file matching your filters
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Select Specific File</strong>: Click the mod card to expand and see all
                                    available versions
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Bulk Selection</strong>: Enable selection mode to download multiple mods at
                                    once
                                </li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-3">
                            <h3 class="font-semibold text-blue-600">Loader Compatibility</h3>
                            <p class="text-sm text-muted-foreground">
                                ModEx generally uses strict filtering to ensure compatibility. However, for
                                <strong>Quilt</strong>,
                                the filter is more flexible and will show files compatible with Quilt, Fabric, Forge,
                                and NeoForge,
                                allowing you to use cross-compatible mods easily.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Settings Section -->
                <div v-if="activeSection === 'settings'" class="space-y-8">
                    <div>
                        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <Settings class="w-8 h-8 text-primary" />
                            Settings
                        </h2>
                        <p class="text-muted-foreground mt-2">
                            Customize ModEx to your preferences.
                        </p>
                    </div>

                    <div class="space-y-6">
                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold">General</h3>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>CurseForge API Key</strong>: Add your own key for faster performance
                                    (optional)
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Check for Updates</strong>: Manually check if a new version of ModEx is
                                    available
                                </li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold">Appearance</h3>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Theme</strong>: Choose between Light, Dark, or System (follows OS
                                    preference)
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Accent Color</strong>: Pick your preferred highlight color
                                </li>
                            </ul>
                        </div>

                        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                            <h3 class="font-semibold">Library</h3>
                            <ul class="space-y-2 text-sm text-muted-foreground ml-6">
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    View statistics: total mods, modpacks, and storage size
                                </li>
                                <li class="flex items-start gap-2">
                                    <ArrowRight class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                    <strong>Danger Zone</strong>: Clear all data to start fresh
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                <!-- Shortcuts Section -->
                <div v-if="activeSection === 'shortcuts'" class="space-y-8">
                    <div>
                        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <Keyboard class="w-8 h-8 text-primary" />
                            Keyboard Shortcuts
                        </h2>
                        <p class="text-muted-foreground mt-2">
                            Speed up your workflow with these shortcuts.
                        </p>
                    </div>

                    <div class="rounded-xl border border-border bg-card/50 overflow-hidden">
                        <div class="divide-y divide-border">
                            <div v-for="shortcut in shortcuts" :key="shortcut.keys"
                                class="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                                <span class="text-sm font-medium">{{ shortcut.action }}</span>
                                <kbd
                                    class="px-3 py-1.5 bg-muted text-xs rounded-md font-mono border border-border shadow-sm">
                                    {{ shortcut.keys }}
                                </kbd>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- FAQ Section -->
                <div v-if="activeSection === 'faq'" class="space-y-8">
                    <div>
                        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <HelpCircle class="w-8 h-8 text-primary" />
                            Frequently Asked Questions
                        </h2>
                        <p class="text-muted-foreground mt-2">
                            Common questions and answers.
                        </p>
                    </div>

                    <div class="space-y-4">
                        <div v-for="(faq, index) in faqs" :key="index"
                            class="p-5 rounded-xl border border-border bg-card/50">
                            <h3 class="font-semibold text-foreground">{{ faq.q }}</h3>
                            <p class="text-sm text-muted-foreground mt-2">{{ faq.a }}</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </div>
</template>
