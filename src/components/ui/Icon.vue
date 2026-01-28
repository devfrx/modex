<script setup lang="ts">
/**
 * Icon Component - Centralized icon system using Iconify
 * 
 * Uses Solar Bold icons (solar:*-bold) for filled rounded look
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
// Using Solar Bold (solar:*-bold) for filled rounded icons
const iconMap: Record<string, string> = {
  // Navigation & UI
  'Home': 'solar:home-2-bold',
  'Menu': 'solar:hamburger-menu-bold',
  'X': 'solar:close-circle-bold',
  'Check': 'solar:check-circle-bold',
  'ChevronDown': 'solar:alt-arrow-down-bold',
  'ChevronUp': 'solar:alt-arrow-up-bold',
  'ChevronLeft': 'solar:alt-arrow-left-bold',
  'ChevronRight': 'solar:alt-arrow-right-bold',
  'ArrowLeft': 'solar:arrow-left-bold',
  'ArrowRight': 'solar:arrow-right-bold',
  'ArrowUp': 'solar:arrow-up-bold',
  'ArrowDown': 'solar:arrow-down-bold',
  'ArrowUpDown': 'solar:sort-vertical-bold',
  'ArrowLeftRight': 'solar:sort-horizontal-bold',
  'ArrowUpCircle': 'solar:round-arrow-up-bold',
  'ArrowDownCircle': 'solar:round-arrow-down-bold',
  'MoreHorizontal': 'solar:menu-dots-bold',
  'MoreVertical': 'solar:menu-dots-bold',
  'ExternalLink': 'solar:square-arrow-right-up-bold',
  'Link': 'solar:link-bold',
  'Link2': 'solar:users-group-rounded-bold',
  'Link2Off': 'solar:link-broken-bold',
  'LinkOff': 'solar:link-broken-bold',
  'Copy': 'solar:copy-bold',
  'Clipboard': 'solar:clipboard-bold',
  'ClipboardCheck': 'solar:clipboard-check-bold',

  // Actions
  'Plus': 'solar:add-circle-bold',
  'PlusCircle': 'solar:add-circle-bold',
  'Minus': 'solar:minus-circle-bold',
  'MinusCircle': 'solar:minus-circle-bold',
  'Trash': 'solar:trash-bin-trash-bold',
  'Trash2': 'solar:trash-bin-trash-bold',
  'Edit': 'solar:pen-bold',
  'Edit2': 'solar:pen-bold',
  'Edit3': 'solar:pen-bold',
  'Pencil': 'solar:pen-bold',
  'FileEdit': 'solar:document-add-bold',
  'Save': 'solar:diskette-bold',
  'Download': 'solar:download-bold',
  'Upload': 'solar:upload-bold',
  'Share': 'solar:share-bold',
  'Share2': 'solar:share-bold',
  'Send': 'solar:plain-bold',
  'RefreshCw': 'solar:refresh-bold',
  'RotateCw': 'solar:restart-bold',
  'RotateCcw': 'solar:undo-left-bold',
  'Undo': 'solar:undo-left-bold',
  'Undo2': 'solar:undo-left-bold',
  'Redo': 'solar:undo-right-bold',
  'Redo2': 'solar:undo-right-bold',
  'Play': 'solar:play-bold',
  'Pause': 'solar:pause-bold',
  'Stop': 'solar:stop-bold',
  'SkipForward': 'solar:skip-next-bold',
  'SkipBack': 'solar:skip-previous-bold',
  'Search': 'solar:magnifer-bold',
  'Filter': 'solar:filter-bold',
  'SlidersHorizontal': 'solar:tuning-2-bold',
  'Sliders': 'solar:tuning-bold',
  'FileSliders': 'solar:settings-bold',
  'Settings': 'solar:settings-bold',
  'Settings2': 'solar:settings-bold',
  'Maximize': 'solar:maximize-bold',
  'Maximize2': 'solar:maximize-bold',
  'Minimize': 'solar:minimize-bold',
  'Minimize2': 'solar:minimize-bold',
  'ZoomIn': 'solar:magnifer-zoom-in-bold',
  'ZoomOut': 'solar:magnifer-zoom-out-bold',
  'Move': 'solar:move-bold',
  'GripVertical': 'solar:widget-6-bold',
  'Grid': 'solar:widget-4-bold',
  'Grid2x2': 'solar:widget-4-bold',
  'Grid3x3': 'solar:widget-5-bold',
  'Grid3X3': 'solar:widget-5-bold',
  'List': 'solar:list-bold',
  'LayoutGrid': 'solar:widget-4-bold',
  'LayoutList': 'solar:list-bold',
  'Rows': 'solar:rows-bold',
  'Columns': 'solar:columns-bold',
  'GalleryVertical': 'solar:gallery-bold',
  'Eye': 'solar:eye-bold',
  'EyeOff': 'solar:eye-closed-bold',
  'Lock': 'solar:lock-bold',
  'Unlock': 'solar:lock-unlocked-bold',
  'LockOpen': 'solar:lock-unlocked-bold',
  'Power': 'solar:power-bold',
  'PowerOff': 'solar:plug-circle-bold',
  'LogIn': 'solar:login-2-bold',
  'LogOut': 'solar:logout-2-bold',

  // Toggle - using Material Icons Round for nice rounded toggle switches
  'ToggleRight': 'ic:round-toggle-on',
  'ToggleLeft': 'ic:round-toggle-off',

  // Status & Alerts
  'AlertCircle': 'solar:danger-circle-bold',
  'AlertTriangle': 'solar:danger-triangle-bold',
  'Info': 'solar:info-circle-bold',
  'HelpCircle': 'solar:question-circle-bold',
  'CheckCircle': 'solar:check-circle-bold',
  'CheckCircle2': 'solar:check-circle-bold',
  'XCircle': 'solar:close-circle-bold',
  'Ban': 'solar:forbidden-circle-bold',
  'Bell': 'solar:bell-bold',
  'BellOff': 'solar:bell-off-bold',
  'Loader2': 'solar:refresh-circle-bold',
  'Loader': 'solar:refresh-circle-bold',

  // Files & Folders
  'File': 'solar:file-bold',
  'FileText': 'solar:document-text-bold',
  'FilePlus': 'solar:file-send-bold',
  'FileMinus': 'solar:file-remove-bold',
  'FileCode': 'solar:code-file-bold',
  'FileImage': 'solar:gallery-bold',
  'FileArchive': 'solar:zip-file-bold',
  'FileDown': 'solar:file-download-bold',
  'Files': 'solar:documents-bold',
  'Folder': 'solar:folder-bold',
  'FolderOpen': 'solar:folder-open-bold',
  'FolderPlus': 'solar:folder-with-files-bold',
  'FolderMinus': 'solar:folder-bold',
  'FolderX': 'solar:folder-error-bold',
  'FolderSync': 'solar:folder-cloud-bold',
  'FolderTree': 'solar:folder-path-connect-bold',

  // Data & Objects
  'Package': 'solar:box-bold',
  'PackagePlus': 'solar:box-bold',
  'Box': 'solar:box-bold',
  'Layers': 'solar:layers-bold',
  'Database': 'solar:database-bold',
  'HardDrive': 'solar:server-bold',
  'Archive': 'solar:archive-bold',
  'Bookmark': 'solar:bookmark-bold',
  'Tag': 'solar:tag-bold',
  'Tags': 'solar:tag-bold',
  'Hash': 'solar:hashtag-bold',
  'Star': 'solar:star-bold',
  'Heart': 'solar:heart-bold',
  'Flame': 'solar:fire-bold',
  'Award': 'solar:cup-star-bold',
  'Trophy': 'solar:cup-bold',
  'Flag': 'solar:flag-bold',
  'Pin': 'solar:pin-bold',

  // Media & Images
  'Image': 'solar:gallery-bold',
  'ImagePlus': 'solar:gallery-add-bold',
  'Images': 'solar:gallery-wide-bold',
  'Camera': 'solar:camera-bold',
  'Video': 'solar:video-frame-bold',
  'Film': 'solar:clapperboard-bold',
  'Music': 'solar:music-note-bold',
  'Headphones': 'solar:headphones-round-bold',
  'Volume': 'solar:volume-loud-bold',
  'Volume2': 'solar:volume-loud-bold',
  'VolumeX': 'solar:volume-cross-bold',
  'Palette': 'solar:pallete-2-bold',

  // Communication
  'Mail': 'solar:letter-bold',
  'MessageCircle': 'solar:chat-round-dots-bold',
  'MessageSquare': 'solar:chat-square-bold',
  'MessageSquarePlus': 'solar:chat-square-bold',
  'MessageSquareDashed': 'solar:chat-square-bold',
  'Phone': 'solar:phone-bold',
  'AtSign': 'solar:at-bold',
  'User': 'solar:user-rounded-bold',
  'Users': 'solar:users-group-rounded-bold',
  'UserPlus': 'solar:user-plus-rounded-bold',
  'UserMinus': 'solar:user-minus-rounded-bold',

  // Time & Date
  'Clock': 'solar:clock-circle-bold',
  'Calendar': 'solar:calendar-bold',
  'CalendarDays': 'solar:calendar-bold',
  'Timer': 'solar:stopwatch-bold',
  'History': 'solar:history-bold',

  // Weather & Nature
  'Sun': 'solar:sun-bold',
  'Moon': 'solar:moon-bold',
  'Cloud': 'solar:cloud-bold',
  'CloudOff': 'solar:cloud-cross-bold',
  'CloudDownload': 'solar:cloud-download-bold',
  'CloudUpload': 'solar:cloud-upload-bold',
  'Droplet': 'solar:water-drops-bold',
  'Wind': 'solar:wind-bold',
  'Snowflake': 'solar:snowflake-bold',
  'Zap': 'solar:bolt-bold',
  'Sparkles': 'solar:stars-bold',

  // Tools & Development
  'Terminal': 'solar:command-bold',
  'Code': 'solar:code-bold',
  'Code2': 'solar:code-bold',
  'Braces': 'solar:code-bold',
  'Bug': 'solar:bug-bold',
  'Wrench': 'solar:wrench-bold',
  'Hammer': 'solar:hammer-bold',
  'Tool': 'solar:wrench-bold',
  'Cog': 'solar:settings-bold',
  'Command': 'solar:command-bold',
  'Option': 'solar:command-bold',
  'Keyboard': 'solar:keyboard-bold',

  // Navigation & Location
  'Map': 'solar:map-bold',
  'MapPin': 'solar:map-point-bold',
  'Compass': 'solar:compass-big-bold',
  'Navigation': 'solar:map-arrow-up-bold',
  'Globe': 'solar:global-bold',
  'Globe2': 'solar:global-bold',
  'Earth': 'solar:earth-bold',

  // Commerce
  'ShoppingCart': 'solar:cart-large-bold',
  'ShoppingBag': 'solar:bag-bold',
  'CreditCard': 'solar:card-bold',
  'DollarSign': 'solar:dollar-bold',
  'Wallet': 'solar:wallet-bold',

  // Charts & Analytics
  'BarChart': 'solar:chart-bold',
  'BarChart2': 'solar:chart-bold',
  'BarChart3': 'solar:chart-bold',
  'LineChart': 'solar:graph-up-bold',
  'PieChart': 'solar:pie-chart-2-bold',
  'Activity': 'solar:health-bold',
  'TrendingUp': 'solar:graph-up-bold',
  'TrendingDown': 'solar:graph-down-bold',
  'Gauge': 'solar:speedometer-bold',

  // Books & Education
  'Book': 'solar:book-bold',
  'BookOpen': 'solar:book-2-bold',
  'BookMarked': 'solar:book-bookmark-bold',
  'Library': 'solar:library-bold',
  'GraduationCap': 'solar:square-academic-cap-bold',
  'Lightbulb': 'solar:lightbulb-bold',

  // Gaming
  'Gamepad': 'solar:gamepad-bold',
  'Gamepad2': 'solar:gamepad-bold',
  'Joystick': 'solar:gamepad-bold',
  'Dice1': 'solar:sledgehammer-bold',
  'Dice6': 'solar:sledgehammer-bold',
  'Target': 'solar:target-bold',
  'Crosshair': 'solar:target-bold',
  'Pickaxe': 'arcticons:minecraft-pickaxe',
  'Sword': 'solar:sword-bold',
  'Shield': 'solar:shield-bold',

  // Git & Version Control
  'GitCommit': 'solar:code-circle-bold',
  'GitBranch': 'solar:branching-paths-up-bold',
  'GitMerge': 'solar:branching-paths-down-bold',
  'Merge': 'solar:branching-paths-down-bold',
  'Github': 'mdi:github',

  // Sort
  'SortAsc': 'solar:sort-from-bottom-to-top-bold',
  'SortDesc': 'solar:sort-from-top-to-bottom-bold',

  // Medical
  'Stethoscope': 'solar:stethoscope-bold',

  // Pointer
  'MousePointer': 'solar:cursor-bold',

  // Misc
  'Rocket': 'solar:rocket-2-bold',
  'Gift': 'solar:gift-bold',
  'Key': 'solar:key-bold',
  'Puzzle': 'solar:puzzle-bold',
  'Fingerprint': 'solar:fingerprint-bold',
  'QrCode': 'solar:qr-code-bold',
  'Wifi': 'solar:wifi-router-bold',
  'WifiOff': 'solar:wifi-router-bold',
  'Bluetooth': 'solar:bluetooth-bold',
  'Battery': 'solar:battery-full-bold',
  'Printer': 'solar:printer-bold',
  'Monitor': 'solar:monitor-bold',
  'Smartphone': 'solar:smartphone-bold',
  'Tablet': 'solar:tablet-bold',
  'Laptop': 'solar:laptop-bold',
  'Server': 'solar:server-bold',
  'Cpu': 'solar:cpu-bold',
  'MemoryStick': 'solar:ssd-round-bold',
  'PanelLeft': 'solar:siderbar-bold',
  'PanelLeftClose': 'solar:siderbar-bold',
  'PanelRight': 'solar:siderbar-bold',
  'PanelRightClose': 'solar:siderbar-bold',
  'Sidebar': 'solar:siderbar-bold',
  'CheckSquare': 'solar:checkbox-bold',
  'ListChecks': 'solar:checklist-minimalistic-bold',
  'Square': 'solar:stop-bold',
  'Circle': 'solar:record-bold',
  'CircleDot': 'solar:record-circle-bold',
  'Text': 'solar:text-bold',
  'Type': 'solar:text-bold',
  'Bold': 'solar:text-bold-bold',
  'Italic': 'solar:text-italic-bold',
  'Underline': 'solar:text-underline-bold',
  'AlignLeft': 'solar:align-left-bold',
  'AlignCenter': 'solar:align-horizontal-center-bold',
  'AlignRight': 'solar:align-right-bold',
  'AlignJustify': 'solar:align-left-bold',
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
