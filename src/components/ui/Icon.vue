<script setup lang="ts">
/**
 * Icon Component - Centralized icon system using Iconify
 * 
 * Uses Phosphor Fill icons (ph:*-fill) for solid filled look with rounded corners
 * All icons are mapped from their Lucide names to Iconify equivalents
 */
import { Icon as IconifyIcon } from '@iconify/vue';
import { computed } from 'vue';

// Vue class binding types - supports all Vue class binding formats
type ClassValue = string | boolean | Record<string, boolean | undefined> | (string | boolean | undefined | null)[] | undefined;

const props = withDefaults(defineProps<{
  name: string;
  size?: string | number;
  class?: ClassValue;
}>(), {
  size: '1em',
});

// Icon mapping: Lucide name -> Iconify icon ID
// Using Phosphor Fill (ph:*-fill) for solid filled icons with rounded corners
const iconMap: Record<string, string> = {
  // Navigation & UI
  'Home': 'ph:house-fill',
  'Menu': 'ph:list-fill',
  'X': 'ph:x-bold',
  'Check': 'ph:check-bold',
  'ChevronDown': 'ph:caret-down-fill',
  'ChevronUp': 'ph:caret-up-fill',
  'ChevronLeft': 'ph:caret-left-fill',
  'ChevronRight': 'ph:caret-right-fill',
  'ArrowLeft': 'ph:arrow-left-bold',
  'ArrowRight': 'ph:arrow-right-bold',
  'ArrowUp': 'ph:arrow-up-bold',
  'ArrowDown': 'ph:arrow-down-bold',
  'ArrowUpDown': 'ph:arrows-down-up-bold',
  'ArrowLeftRight': 'ph:arrows-left-right-bold',
  'ArrowUpCircle': 'ph:arrow-circle-up-fill',
  'ArrowDownCircle': 'ph:arrow-circle-down-fill',
  'MoreHorizontal': 'ph:dots-three-bold',
  'MoreVertical': 'ph:dots-three-vertical-bold',
  'ExternalLink': 'ph:arrow-square-out-fill',
  'Link': 'ph:link-fill',
  'Link2': 'ph:users-three-fill',
  'Link2Off': 'ph:link-break-fill',
  'LinkOff': 'ph:link-break-fill',
  'Copy': 'ph:copy-fill',
  'Clipboard': 'ph:clipboard-fill',
  'ClipboardCheck': 'ph:clipboard-text-fill',

  // Actions
  'Plus': 'ph:plus-bold',
  'PlusCircle': 'ph:plus-circle-fill',
  'Minus': 'ph:minus-bold',
  'MinusCircle': 'ph:minus-circle-fill',
  'Trash': 'ph:trash-fill',
  'Trash2': 'ph:trash-fill',
  'Edit': 'ph:pencil-simple-fill',
  'Edit2': 'ph:pencil-simple-fill',
  'Edit3': 'ph:pencil-simple-fill',
  'Pencil': 'ph:pencil-simple-fill',
  'FileEdit': 'ph:pencil-simple-fill',
  'Save': 'ph:floppy-disk-fill',
  'Download': 'ph:download-simple-fill',
  'Upload': 'ph:upload-simple-fill',
  'Share': 'ph:share-fill',
  'Share2': 'ph:share-network-fill',
  'Send': 'ph:paper-plane-right-fill',
  'RefreshCw': 'ph:arrows-clockwise-bold',
  'RotateCw': 'ph:arrow-clockwise-bold',
  'RotateCcw': 'ph:arrow-counter-clockwise-bold',
  'Undo': 'ph:arrow-u-up-left-bold',
  'Undo2': 'ph:arrow-u-up-left-bold',
  'Redo': 'ph:arrow-u-up-right-bold',
  'Redo2': 'ph:arrow-u-up-right-bold',
  'Play': 'ph:play-fill',
  'Pause': 'ph:pause-fill',
  'Stop': 'ph:stop-fill',
  'SkipForward': 'ph:skip-forward-fill',
  'SkipBack': 'ph:skip-back-fill',
  'Search': 'ph:magnifying-glass-bold',
  'Filter': 'ph:funnel-fill',
  'SlidersHorizontal': 'ph:sliders-horizontal-fill',
  'Sliders': 'ph:sliders-fill',
  'FileSliders': 'ph:faders-fill',
  'Settings': 'ph:gear-fill',
  'Settings2': 'ph:gear-six-fill',
  'Maximize': 'ph:arrows-out-bold',
  'Maximize2': 'ph:arrows-out-bold',
  'Minimize': 'ph:arrows-in-bold',
  'Minimize2': 'ph:arrows-in-bold',
  'ZoomIn': 'ph:magnifying-glass-plus-bold',
  'ZoomOut': 'ph:magnifying-glass-minus-bold',
  'Move': 'ph:arrows-out-cardinal-bold',
  'GripVertical': 'ph:dots-six-vertical-bold',
  'Grid': 'ph:squares-four-fill',
  'Grid2x2': 'ph:squares-four-fill',
  'Grid3x3': 'ph:grid-nine-fill',
  'Grid3X3': 'ph:grid-nine-fill',
  'List': 'ph:list-bullets-fill',
  'LayoutGrid': 'ph:squares-four-fill',
  'LayoutList': 'ph:list-fill',
  'Rows': 'ph:rows-fill',
  'Columns': 'ph:columns-fill',
  'GalleryVertical': 'ph:rows-fill',
  'Eye': 'ph:eye-fill',
  'EyeOff': 'ph:eye-slash-fill',
  'Lock': 'ph:lock-fill',
  'Unlock': 'ph:lock-open-fill',
  'LockOpen': 'ph:lock-open-fill',
  'Power': 'ph:power-fill',
  'PowerOff': 'ph:plug-fill',
  'LogIn': 'ph:sign-in-fill',
  'LogOut': 'ph:sign-out-fill',

  // Toggle
  'ToggleRight': 'ph:toggle-right-fill',
  'ToggleLeft': 'ph:toggle-left-fill',

  // Status & Alerts
  'AlertCircle': 'ph:warning-circle-fill',
  'AlertTriangle': 'ph:warning-fill',
  'Info': 'ph:info-fill',
  'HelpCircle': 'ph:question-fill',
  'CheckCircle': 'ph:check-circle-fill',
  'CheckCircle2': 'ph:check-circle-fill',
  'XCircle': 'ph:x-circle-fill',
  'Ban': 'ph:prohibit-fill',
  'Bell': 'ph:bell-fill',
  'BellOff': 'ph:bell-slash-fill',
  'Loader2': 'ph:spinner-bold',
  'Loader': 'ph:spinner-bold',

  // Files & Folders
  'File': 'ph:file-fill',
  'FileText': 'ph:file-text-fill',
  'FilePlus': 'ph:file-plus-fill',
  'FileMinus': 'ph:file-minus-fill',
  'FileCode': 'ph:file-code-fill',
  'FileImage': 'ph:file-image-fill',
  'FileArchive': 'ph:file-zip-fill',
  'FileDown': 'ph:file-arrow-down-fill',
  'Files': 'ph:files-fill',
  'Folder': 'ph:folder-fill',
  'FolderOpen': 'ph:folder-open-fill',
  'FolderPlus': 'ph:folder-plus-fill',
  'FolderMinus': 'ph:folder-minus-fill',
  'FolderX': 'ph:folder-minus-fill',
  'FolderSync': 'ph:folder-fill',
  'FolderTree': 'ph:tree-structure-fill',

  // Data & Objects
  'Package': 'ph:package-fill',
  'PackagePlus': 'ph:package-fill',
  'Box': 'ph:cube-fill',
  'Layers': 'ph:stack-fill',
  'Database': 'ph:database-fill',
  'HardDrive': 'ph:hard-drives-fill',
  'Archive': 'ph:archive-fill',
  'Bookmark': 'ph:bookmark-simple-fill',
  'Tag': 'ph:tag-fill',
  'Tags': 'ph:tag-fill',
  'Hash': 'ph:hash-bold',
  'Star': 'ph:star-fill',
  'Heart': 'ph:heart-fill',
  'Flame': 'ph:fire-fill',
  'Award': 'ph:trophy-fill',
  'Trophy': 'ph:trophy-fill',
  'Flag': 'ph:flag-fill',
  'Pin': 'ph:push-pin-fill',

  // Media & Images
  'Image': 'ph:image-fill',
  'ImagePlus': 'ph:image-fill',
  'Images': 'ph:images-fill',
  'Camera': 'ph:camera-fill',
  'Video': 'ph:video-fill',
  'Film': 'ph:film-strip-fill',
  'Music': 'ph:music-note-fill',
  'Headphones': 'ph:headphones-fill',
  'Volume': 'ph:speaker-high-fill',
  'Volume2': 'ph:speaker-high-fill',
  'VolumeX': 'ph:speaker-x-fill',
  'Palette': 'ph:palette-fill',

  // Communication
  'Mail': 'ph:envelope-fill',
  'MessageCircle': 'ph:chat-circle-fill',
  'MessageSquare': 'ph:chat-fill',
  'MessageSquarePlus': 'ph:chat-text-fill',
  'MessageSquareDashed': 'ph:chat-fill',
  'Phone': 'ph:phone-fill',
  'AtSign': 'ph:at-bold',
  'User': 'ph:user-fill',
  'Users': 'ph:users-fill',
  'UserPlus': 'ph:user-plus-fill',
  'UserMinus': 'ph:user-minus-fill',

  // Time & Date
  'Clock': 'ph:clock-fill',
  'Calendar': 'ph:calendar-fill',
  'CalendarDays': 'ph:calendar-fill',
  'Timer': 'ph:timer-fill',
  'History': 'ph:clock-counter-clockwise-fill',

  // Weather & Nature
  'Sun': 'ph:sun-fill',
  'Moon': 'ph:moon-fill',
  'Cloud': 'ph:cloud-fill',
  'CloudOff': 'ph:cloud-slash-fill',
  'CloudDownload': 'ph:cloud-arrow-down-fill',
  'CloudUpload': 'ph:cloud-arrow-up-fill',
  'Droplet': 'ph:drop-fill',
  'Wind': 'ph:wind-fill',
  'Snowflake': 'ph:snowflake-fill',
  'Zap': 'ph:lightning-fill',
  'Sparkles': 'ph:sparkle-fill',

  // Tools & Development
  'Terminal': 'ph:terminal-fill',
  'Code': 'ph:code-bold',
  'Code2': 'ph:code-bold',
  'Braces': 'ph:brackets-curly-bold',
  'Bug': 'ph:bug-fill',
  'Wrench': 'ph:wrench-fill',
  'Hammer': 'ph:hammer-fill',
  'Tool': 'ph:wrench-fill',
  'Cog': 'ph:gear-fill',
  'Command': 'ph:command-bold',
  'Option': 'ph:option-bold',
  'Keyboard': 'ph:keyboard-fill',

  // Navigation & Location
  'Map': 'ph:map-trifold-fill',
  'MapPin': 'ph:map-pin-fill',
  'Compass': 'ph:compass-fill',
  'Navigation': 'ph:navigation-arrow-fill',
  'Globe': 'ph:globe-fill',
  'Globe2': 'ph:globe-simple-fill',
  'Earth': 'ph:globe-fill',

  // Commerce
  'ShoppingCart': 'ph:shopping-cart-fill',
  'ShoppingBag': 'ph:shopping-bag-fill',
  'CreditCard': 'ph:credit-card-fill',
  'DollarSign': 'ph:currency-dollar-bold',
  'Wallet': 'ph:wallet-fill',

  // Charts & Analytics
  'BarChart': 'ph:chart-bar-fill',
  'BarChart2': 'ph:chart-bar-fill',
  'BarChart3': 'ph:chart-bar-fill',
  'LineChart': 'ph:chart-line-fill',
  'PieChart': 'ph:chart-pie-fill',
  'Activity': 'ph:activity-bold',
  'TrendingUp': 'ph:trend-up-bold',
  'TrendingDown': 'ph:trend-down-bold',
  'Gauge': 'ph:gauge-fill',

  // Books & Education
  'Book': 'ph:book-fill',
  'BookOpen': 'ph:book-open-fill',
  'BookMarked': 'ph:book-bookmark-fill',
  'Library': 'ph:books-fill',
  'GraduationCap': 'ph:graduation-cap-fill',
  'Lightbulb': 'ph:lightbulb-fill',

  // Gaming
  'Gamepad': 'ph:game-controller-fill',
  'Gamepad2': 'ph:game-controller-fill',
  'Joystick': 'ph:game-controller-fill',
  'Dice1': 'ph:dice-one-fill',
  'Dice6': 'ph:dice-six-fill',
  'Target': 'ph:target-fill',
  'Crosshair': 'ph:crosshair-bold',
  'Pickaxe': 'ph:pickaxe-fill',
  'Sword': 'ph:sword-fill',
  'Shield': 'ph:shield-fill',

  // Git & Version Control
  'GitCommit': 'ph:git-commit-fill',
  'GitBranch': 'ph:git-branch-fill',
  'GitMerge': 'ph:git-merge-fill',
  'Merge': 'ph:git-merge-fill',
  'Github': 'ph:github-logo-fill',

  // Sort
  'SortAsc': 'ph:sort-ascending-fill',
  'SortDesc': 'ph:sort-descending-fill',

  // Medical
  'Stethoscope': 'ph:stethoscope-fill',

  // Pointer
  'MousePointer': 'ph:cursor-fill',

  // Misc
  'Rocket': 'ph:rocket-fill',
  'Gift': 'ph:gift-fill',
  'Key': 'ph:key-fill',
  'Puzzle': 'ph:puzzle-piece-fill',
  'Fingerprint': 'ph:fingerprint-fill',
  'QrCode': 'ph:qr-code-fill',
  'Wifi': 'ph:wifi-high-fill',
  'WifiOff': 'ph:wifi-slash-fill',
  'Bluetooth': 'ph:bluetooth-fill',
  'Battery': 'ph:battery-full-fill',
  'Printer': 'ph:printer-fill',
  'Monitor': 'ph:monitor-fill',
  'Smartphone': 'ph:device-mobile-fill',
  'Tablet': 'ph:device-tablet-fill',
  'Laptop': 'ph:laptop-fill',
  'Server': 'ph:hard-drives-fill',
  'Cpu': 'ph:cpu-fill',
  'MemoryStick': 'ph:memory-fill',
  'PanelLeft': 'ph:sidebar-fill',
  'PanelLeftClose': 'ph:sidebar-fill',
  'PanelRight': 'ph:sidebar-fill',
  'PanelRightClose': 'ph:sidebar-fill',
  'Sidebar': 'ph:sidebar-fill',
  'CheckSquare': 'ph:check-square-fill',
  'Square': 'ph:square-fill',
  'Circle': 'ph:circle-fill',
  'CircleDot': 'ph:circle-dashed-bold',
  'Text': 'ph:text-aa-bold',
  'Type': 'ph:text-t-bold',
  'Bold': 'ph:text-b-bold',
  'Italic': 'ph:text-italic-bold',
  'Underline': 'ph:text-underline-bold',
  'AlignLeft': 'ph:text-align-left-fill',
  'AlignCenter': 'ph:text-align-center-fill',
  'AlignRight': 'ph:text-align-right-fill',
  'AlignJustify': 'ph:text-align-justify-fill',
};

// Resolve icon name to Iconify ID
const iconId = computed(() => {
  const mapped = iconMap[props.name];
  if (mapped) return mapped;

  // Fallback: try lucide directly
  const kebabName = props.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  return `lucide:${kebabName}`;
});

// Handle size prop
const iconSize = computed(() => {
  if (typeof props.size === 'number') return `${props.size}px`;
  return props.size;
});
</script>

<template>
  <IconifyIcon :icon="iconId" :width="iconSize" :height="iconSize" :class="props.class" />
</template>
