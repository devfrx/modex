<script setup lang="ts">
/**
 * ConfigEditor - Modern config file editor with visual editing mode
 * 
 * Features:
 * - Dual mode: Raw text / Visual form-based editor
 * - Syntax-aware editing for TOML/JSON
 * - Array editing with add/remove
 * - Type-aware inputs (toggles, numbers, colors, etc.)
 * - Collapsible sections
 * - Search functionality
 * - Fullscreen mode
 */
import { ref, computed, watch, nextTick } from "vue";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
import {
  Save,
  RotateCcw,
  ExternalLink,
  FileCode,
  FileJson,
  FileText,
  AlertCircle,
  Check,
  Copy,
  Loader2,
  Search,
  ArrowUp,
  ArrowDown,
  X,
  Maximize2,
  Minimize2,
  Code2,
  LayoutList,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Hash,
  ToggleLeft,
  Type,
  List,
  Info,
  AlertTriangle,
} from "lucide-vue-next";
import type { ConfigFile } from "@/types";

const props = defineProps<{
  instanceId: string;
  file: ConfigFile | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved"): void;
}>();

const toast = useToast();

// Editor mode
type EditorMode = "raw" | "visual";
const editorMode = ref<EditorMode>("visual");

// State
const content = ref("");
const originalContent = ref("");
const isLoading = ref(false);
const isSaving = ref(false);
const parseError = ref<string | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const showSearch = ref(false);
const searchQuery = ref("");
const currentMatch = ref(0);
const totalMatches = ref(0);
const isFullscreen = ref(false);
const currentLine = ref(1);

// Visual editor state
interface ConfigValue {
  key: string;
  value: any;
  type: "string" | "number" | "boolean" | "array" | "object";
  comment?: string;
  arrayType?: "string" | "number" | "boolean";
  isColor?: boolean;
  isExpanded?: boolean;
}

interface ConfigSection {
  name: string;
  displayName: string;
  values: ConfigValue[];
  isExpanded: boolean;
  comment?: string;
}

const configSections = ref<ConfigSection[]>([]);
const visualParseError = ref<string | null>(null);

// Computed
const hasChanges = computed(() => content.value !== originalContent.value);
const lineCount = computed(() => content.value.split("\n").length);
const changedLineCount = computed(() => {
  if (!hasChanges.value) return 0;
  const originalLines = originalContent.value.split("\n");
  const currentLines = content.value.split("\n");
  let count = 0;
  const maxLen = Math.max(originalLines.length, currentLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (originalLines[i] !== currentLines[i]) count++;
  }
  return count;
});

const supportsVisualMode = computed(() => {
  return props.file?.type === "toml" || props.file?.type === "json" || props.file?.type === "json5";
});

// Parse TOML content for visual editing
function parseTomlForVisual(tomlContent: string): ConfigSection[] {
  const sections: ConfigSection[] = [];
  const lines = tomlContent.split("\n");

  let currentSection: ConfigSection = {
    name: "__root__",
    displayName: "General",
    values: [],
    isExpanded: true,
  };

  let pendingComment = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      pendingComment = "";
      continue;
    }

    // Comment line
    if (line.startsWith("#")) {
      pendingComment = line.substring(1).trim();
      continue;
    }

    // Section header
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      if (currentSection.values.length > 0 || currentSection.name !== "__root__") {
        sections.push(currentSection);
      }

      const sectionName = sectionMatch[1];
      currentSection = {
        name: sectionName,
        displayName: formatSectionName(sectionName),
        values: [],
        isExpanded: true,
        comment: pendingComment || undefined,
      };
      pendingComment = "";
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^([^=]+)=\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const rawValue = kvMatch[2].trim();
      const parsed = parseTomlValue(rawValue);

      const configValue: ConfigValue = {
        key,
        value: parsed.value,
        type: parsed.type,
        comment: pendingComment || undefined,
        arrayType: parsed.arrayType,
        isColor: isColorValue(key, parsed.value),
        isExpanded: true,
      };

      currentSection.values.push(configValue);
      pendingComment = "";
    }
  }

  // Add last section
  if (currentSection.values.length > 0 || sections.length === 0) {
    sections.push(currentSection);
  }

  return sections;
}

function parseTomlValue(raw: string): { value: any; type: ConfigValue["type"]; arrayType?: ConfigValue["arrayType"] } {
  // Boolean
  if (raw === "true") return { value: true, type: "boolean" };
  if (raw === "false") return { value: false, type: "boolean" };

  // String (quoted)
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return { value: raw.slice(1, -1), type: "string" };
  }

  // Array
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const arrayContent = raw.slice(1, -1).trim();
    if (!arrayContent) return { value: [], type: "array", arrayType: "string" };

    // Parse array elements
    const elements: any[] = [];
    let arrayType: ConfigValue["arrayType"] = "string";

    // Simple parsing for basic arrays
    const parts = splitArrayElements(arrayContent);
    for (const part of parts) {
      const parsed = parseTomlValue(part.trim());
      if (parsed.type === "number") arrayType = "number";
      else if (parsed.type === "boolean") arrayType = "boolean";
      elements.push(parsed.value);
    }

    return { value: elements, type: "array", arrayType };
  }

  // Number
  const num = parseFloat(raw);
  if (!isNaN(num)) return { value: num, type: "number" };

  // Default to string
  return { value: raw, type: "string" };
}

function splitArrayElements(content: string): string[] {
  const elements: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
      current += char;
    } else if (inString && char === stringChar && content[i - 1] !== "\\") {
      inString = false;
      current += char;
    } else if (!inString && char === "[") {
      depth++;
      current += char;
    } else if (!inString && char === "]") {
      depth--;
      current += char;
    } else if (!inString && char === "," && depth === 0) {
      elements.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) elements.push(current.trim());
  return elements;
}

function formatSectionName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function isColorValue(key: string, value: any): boolean {
  const colorKeywords = ["color", "colour", "tint", "hue"];
  const keyLower = key.toLowerCase();

  if (colorKeywords.some(k => keyLower.includes(k))) {
    if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) return true;
    if (typeof value === "number" && value >= 0 && value <= 16777215) return true;
  }
  return false;
}

// Convert visual config back to TOML
function visualToToml(): string {
  const lines: string[] = [];

  for (const section of configSections.value) {
    // Add section comment
    if (section.comment) {
      lines.push(`# ${section.comment}`);
    }

    // Add section header (skip root)
    if (section.name !== "__root__") {
      if (lines.length > 0) lines.push("");
      lines.push(`[${section.name}]`);
    }

    // Add values
    for (const val of section.values) {
      if (val.comment) {
        lines.push(`\t# ${val.comment}`);
      }
      lines.push(`\t${val.key} = ${formatTomlValue(val)}`);
    }
  }

  return lines.join("\n");
}

function formatTomlValue(val: ConfigValue): string {
  switch (val.type) {
    case "boolean":
      return val.value ? "true" : "false";
    case "number":
      return String(val.value);
    case "string":
      return `"${String(val.value).replace(/"/g, '\\"')}"`;
    case "array":
      const items = (val.value as any[]).map(item => {
        if (typeof item === "string") return `"${item.replace(/"/g, '\\"')}"`;
        return String(item);
      });
      return `[${items.join(", ")}]`;
    default:
      return `"${val.value}"`;
  }
}

// Parse JSON for visual editing
function parseJsonForVisual(jsonContent: string): ConfigSection[] {
  try {
    const obj = JSON.parse(jsonContent);
    return objectToSections(obj);
  } catch (e) {
    visualParseError.value = "Failed to parse JSON";
    return [];
  }
}

function objectToSections(obj: any, parentKey = ""): ConfigSection[] {
  const sections: ConfigSection[] = [];
  const rootSection: ConfigSection = {
    name: parentKey || "__root__",
    displayName: parentKey ? formatSectionName(parentKey) : "General",
    values: [],
    isExpanded: true,
  };

  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // Nested object becomes a section
      const nestedSections = objectToSections(value, key);
      sections.push(...nestedSections);
    } else {
      const type = getValueType(value);
      rootSection.values.push({
        key,
        value,
        type,
        arrayType: type === "array" ? getArrayType(value as any[]) : undefined,
        isColor: isColorValue(key, value),
        isExpanded: true,
      });
    }
  }

  if (rootSection.values.length > 0) {
    sections.unshift(rootSection);
  }

  return sections;
}

function getValueType(value: any): ConfigValue["type"] {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object" && value !== null) return "object";
  return "string";
}

function getArrayType(arr: any[]): ConfigValue["arrayType"] {
  if (arr.length === 0) return "string";
  if (typeof arr[0] === "number") return "number";
  if (typeof arr[0] === "boolean") return "boolean";
  return "string";
}

// Load file content
async function loadContent() {
  if (!props.file) return;

  isLoading.value = true;
  parseError.value = null;
  visualParseError.value = null;

  try {
    const result = await window.api.configs.read(props.instanceId, props.file.path);
    content.value = result.content;
    originalContent.value = result.content;

    if (result.parseError) {
      parseError.value = result.parseError;
    }

    // Parse for visual mode
    if (supportsVisualMode.value) {
      parseForVisualMode();
    }
  } catch (error: any) {
    console.error("Failed to load config:", error);
    toast.error("Failed to load file", error.message);
  } finally {
    isLoading.value = false;
  }
}

function parseForVisualMode() {
  try {
    if (props.file?.type === "toml") {
      configSections.value = parseTomlForVisual(content.value);
    } else if (props.file?.type === "json" || props.file?.type === "json5") {
      configSections.value = parseJsonForVisual(content.value);
    }
    visualParseError.value = null;
  } catch (e: any) {
    visualParseError.value = e.message;
    editorMode.value = "raw";
  }
}

// Update content when visual values change
function updateFromVisual() {
  if (props.file?.type === "toml") {
    content.value = visualToToml();
  } else if (props.file?.type === "json" || props.file?.type === "json5") {
    content.value = JSON.stringify(sectionsToObject(), null, 2);
  }
}

function sectionsToObject(): any {
  const result: any = {};

  for (const section of configSections.value) {
    let target = result;

    if (section.name !== "__root__") {
      result[section.name] = {};
      target = result[section.name];
    }

    for (const val of section.values) {
      target[val.key] = val.value;
    }
  }

  return result;
}

// Array editing
function addArrayItem(val: ConfigValue) {
  if (val.type !== "array") return;

  const arr = val.value as any[];
  switch (val.arrayType) {
    case "number":
      arr.push(0);
      break;
    case "boolean":
      arr.push(false);
      break;
    default:
      arr.push("");
  }
  updateFromVisual();
}

function removeArrayItem(val: ConfigValue, index: number) {
  if (val.type !== "array") return;
  (val.value as any[]).splice(index, 1);
  updateFromVisual();
}

function updateArrayItem(val: ConfigValue, index: number, newValue: any) {
  if (val.type !== "array") return;
  (val.value as any[])[index] = newValue;
  updateFromVisual();
}

// Save changes
async function saveChanges() {
  if (!props.file || !hasChanges.value) return;

  isSaving.value = true;

  try {
    await window.api.configs.write(props.instanceId, props.file.path, content.value);
    originalContent.value = content.value;
    toast.success("Saved", props.file.name);
    emit("saved");
  } catch (error: any) {
    console.error("Failed to save config:", error);
    toast.error("Save failed", error.message);
  } finally {
    isSaving.value = false;
  }
}

// Revert changes
function revertChanges() {
  if (!confirm("Discard all changes?")) return;
  content.value = originalContent.value;
  parseForVisualMode();
}

// Open in external editor
async function openExternal() {
  if (!props.file) return;
  try {
    await window.api.configs.openExternal(props.instanceId, props.file.path);
  } catch (error: any) {
    toast.error("Failed to open file", error.message);
  }
}

// Copy content to clipboard
async function copyContent() {
  await navigator.clipboard.writeText(content.value);
  toast.success("Copied", "Content copied to clipboard");
}

// Search functionality
function searchInFile() {
  if (!searchQuery.value || !content.value) {
    totalMatches.value = 0;
    currentMatch.value = 0;
    return;
  }

  const regex = new RegExp(searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const matches = content.value.match(regex);
  totalMatches.value = matches ? matches.length : 0;
  currentMatch.value = totalMatches.value > 0 ? 1 : 0;
}

function nextMatch() {
  if (currentMatch.value < totalMatches.value) {
    currentMatch.value++;
  } else {
    currentMatch.value = 1;
  }
}

function prevMatch() {
  if (currentMatch.value > 1) {
    currentMatch.value--;
  } else {
    currentMatch.value = totalMatches.value;
  }
}

function closeSearch() {
  showSearch.value = false;
  searchQuery.value = "";
  totalMatches.value = 0;
  currentMatch.value = 0;
}

// Handle keyboard shortcuts
function handleKeyDown(event: KeyboardEvent) {
  if (event.ctrlKey && event.key === "s") {
    event.preventDefault();
    saveChanges();
  }
  if (event.ctrlKey && event.key === "f") {
    event.preventDefault();
    showSearch.value = true;
    nextTick(() => {
      const searchInput = document.querySelector('.search-field') as HTMLInputElement;
      searchInput?.focus();
    });
  }
  if (event.key === "Escape") {
    if (showSearch.value) closeSearch();
    if (isFullscreen.value) isFullscreen.value = false;
  }
}

// Update current line on cursor move
function updateCurrentLine(event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  const cursorPos = textarea.selectionStart;
  const textBeforeCursor = content.value.substring(0, cursorPos);
  currentLine.value = textBeforeCursor.split("\n").length;
}

// Get file icon
function getFileIcon(type?: string) {
  switch (type) {
    case "json":
    case "json5":
      return FileJson;
    case "toml":
    case "cfg":
    case "yaml":
      return FileCode;
    default:
      return FileText;
  }
}

// Get file type badge class
function getTypeBadgeClass(type?: string): string {
  switch (type) {
    case "json":
    case "json5":
      return "badge-json";
    case "toml":
      return "badge-toml";
    case "yaml":
      return "badge-yaml";
    case "cfg":
      return "badge-cfg";
    default:
      return "badge-default";
  }
}

// Get type icon
function getTypeIcon(type: ConfigValue["type"]) {
  switch (type) {
    case "number":
      return Hash;
    case "boolean":
      return ToggleLeft;
    case "array":
      return List;
    case "string":
      return Type;
    default:
      return Type;
  }
}

// Toggle section
function toggleSection(section: ConfigSection) {
  section.isExpanded = !section.isExpanded;
}

// Color helpers
function hexToDecimal(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

function decimalToHex(decimal: number): string {
  return "#" + decimal.toString(16).padStart(6, "0");
}

// Template helpers to avoid inline type casts
function getArrayLength(val: ConfigValue): number {
  return Array.isArray(val.value) ? val.value.length : 0;
}

function getArrayItems(val: ConfigValue): any[] {
  return Array.isArray(val.value) ? val.value : [];
}

function handleNumberInput(event: Event, val: ConfigValue) {
  const target = event.target as HTMLInputElement;
  val.value = parseFloat(target.value) || 0;
  updateFromVisual();
}

function handleStringInput(event: Event, val: ConfigValue) {
  const target = event.target as HTMLInputElement;
  val.value = target.value;
  updateFromVisual();
}

function handleColorInput(event: Event, val: ConfigValue) {
  const target = event.target as HTMLInputElement;
  val.value = hexToDecimal(target.value);
  updateFromVisual();
}

function handleArrayStringInput(event: Event, val: ConfigValue, idx: number) {
  const target = event.target as HTMLInputElement;
  updateArrayItem(val, idx, target.value);
}

function handleArrayNumberInput(event: Event, val: ConfigValue, idx: number) {
  const target = event.target as HTMLInputElement;
  updateArrayItem(val, idx, parseFloat(target.value) || 0);
}

// Watch for file changes
watch(() => props.file, () => {
  if (props.file) {
    loadContent();
    // Default to visual mode for supported types
    editorMode.value = supportsVisualMode.value ? "visual" : "raw";
  } else {
    content.value = "";
    originalContent.value = "";
    configSections.value = [];
  }
}, { immediate: true });

// Watch for mode change to re-parse
watch(editorMode, (newMode) => {
  if (newMode === "visual" && supportsVisualMode.value) {
    parseForVisualMode();
  }
});

// Watch search query
watch(searchQuery, () => {
  searchInFile();
});

// Handle tab key in textarea
function handleTab(event: KeyboardEvent) {
  if (event.key === "Tab") {
    event.preventDefault();
    const textarea = event.target as HTMLTextAreaElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    content.value = content.value.substring(0, start) + "  " + content.value.substring(end);

    nextTick(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    });
  }
}
</script>

<template>
  <div :class="['config-editor', isFullscreen && 'editor-fullscreen']" @keydown="handleKeyDown">
    <!-- Empty State -->
    <div v-if="!file" class="empty-state">
      <div class="empty-icon">
        <Code2 class="w-10 h-10 text-muted-foreground/50" />
      </div>
      <p class="text-lg font-medium text-muted-foreground">No file selected</p>
      <p class="text-sm text-muted-foreground/70">Select a config file from the list to edit</p>
    </div>

    <!-- Editor -->
    <template v-else>
      <!-- Header -->
      <div class="editor-header">
        <div class="header-file-info">
          <div class="file-icon">
            <component :is="getFileIcon(file.type)" class="w-5 h-5 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-foreground truncate">{{ file.name }}</span>
              <span :class="['type-badge', getTypeBadgeClass(file.type)]">
                {{ file.type }}
              </span>
            </div>
            <div class="text-xs text-muted-foreground truncate mt-0.5">{{ file.path }}</div>
          </div>
        </div>

        <div class="header-status">
          <div v-if="hasChanges" class="status-indicator status-modified">
            <AlertCircle class="w-3.5 h-3.5" />
            <span>{{ changedLineCount }} modified</span>
          </div>
          <div v-else-if="!isLoading" class="status-indicator status-saved">
            <Check class="w-3.5 h-3.5" />
            <span>Saved</span>
          </div>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="editor-toolbar">
        <div class="toolbar-left">
          <!-- Mode Toggle -->
          <div v-if="supportsVisualMode" class="mode-toggle">
            <button @click="editorMode = 'visual'" :class="['mode-btn', editorMode === 'visual' && 'mode-btn-active']"
              title="Visual Editor">
              <LayoutList class="w-4 h-4" />
              <span>Visual</span>
            </button>
            <button @click="editorMode = 'raw'" :class="['mode-btn', editorMode === 'raw' && 'mode-btn-active']"
              title="Raw Text">
              <Code2 class="w-4 h-4" />
              <span>Raw</span>
            </button>
          </div>

          <div v-if="supportsVisualMode" class="toolbar-divider"></div>

          <button @click="showSearch = !showSearch" :class="['toolbar-btn', showSearch && 'toolbar-btn-active']"
            title="Search (Ctrl+F)">
            <Search class="w-4 h-4" />
          </button>
          <button @click="copyContent" class="toolbar-btn" title="Copy content">
            <Copy class="w-4 h-4" />
          </button>
          <button @click="openExternal" class="toolbar-btn" title="Open in external editor">
            <ExternalLink class="w-4 h-4" />
          </button>
          <button @click="isFullscreen = !isFullscreen" class="toolbar-btn" title="Toggle fullscreen">
            <Maximize2 v-if="!isFullscreen" class="w-4 h-4" />
            <Minimize2 v-else class="w-4 h-4" />
          </button>
        </div>

        <div class="toolbar-right">
          <Button variant="ghost" size="sm" @click="revertChanges" :disabled="!hasChanges" class="gap-1.5">
            <RotateCcw class="w-4 h-4" />
            <span class="hidden sm:inline">Revert</span>
          </Button>
          <Button size="sm" @click="saveChanges" :disabled="!hasChanges || isSaving" class="gap-1.5">
            <Save v-if="!isSaving" class="w-4 h-4" />
            <Loader2 v-else class="w-4 h-4 animate-spin" />
            <span class="hidden sm:inline">Save</span>
          </Button>
        </div>
      </div>

      <!-- Search Bar -->
      <div v-if="showSearch" class="search-bar">
        <div class="search-field-wrapper">
          <Search class="search-field-icon" />
          <input v-model="searchQuery" type="text" placeholder="Search in file..." class="search-field" />
        </div>
        <div v-if="searchQuery" class="search-nav">
          <span class="search-count">
            {{ totalMatches > 0 ? `${currentMatch}/${totalMatches}` : 'No results' }}
          </span>
          <button @click="prevMatch" :disabled="totalMatches === 0" class="search-nav-btn">
            <ArrowUp class="w-4 h-4" />
          </button>
          <button @click="nextMatch" :disabled="totalMatches === 0" class="search-nav-btn">
            <ArrowDown class="w-4 h-4" />
          </button>
        </div>
        <button @click="closeSearch" class="search-close">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Parse Error Warning -->
      <div v-if="parseError || visualParseError" class="parse-error">
        <AlertTriangle class="w-4 h-4 flex-shrink-0" />
        <span>{{ visualParseError || parseError }}</span>
        <button v-if="visualParseError" @click="editorMode = 'raw'" class="ml-auto text-xs underline">
          Switch to Raw mode
        </button>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="loading-container">
        <Loader2 class="w-8 h-8 animate-spin text-primary" />
        <p class="text-sm text-muted-foreground mt-2">Loading file...</p>
      </div>

      <!-- Visual Editor Mode -->
      <div v-else-if="editorMode === 'visual' && supportsVisualMode" class="visual-editor custom-scrollbar">
        <div v-if="configSections.length === 0" class="visual-empty">
          <Info class="w-8 h-8 text-muted-foreground/50" />
          <p class="text-muted-foreground">No configurable values found</p>
        </div>

        <div v-else class="visual-sections">
          <div v-for="section in configSections" :key="section.name" class="config-section">
            <!-- Section Header -->
            <button @click="toggleSection(section)" class="section-header">
              <component :is="section.isExpanded ? ChevronDown : ChevronRight" class="w-4 h-4 text-muted-foreground" />
              <span class="section-title">{{ section.displayName }}</span>
              <span class="section-count">{{ section.values.length }} items</span>
            </button>

            <!-- Section Content -->
            <div v-if="section.isExpanded" class="section-content">
              <div v-for="val in section.values" :key="val.key" class="config-item">
                <!-- Item Header -->
                <div class="item-header">
                  <component :is="getTypeIcon(val.type)" class="item-type-icon" />
                  <div class="item-info">
                    <span class="item-key">{{ val.key }}</span>
                    <span v-if="val.comment" class="item-comment">{{ val.comment }}</span>
                  </div>
                  <span class="item-type-badge">{{ val.type }}</span>
                </div>

                <!-- Item Value Editor -->
                <div class="item-value">
                  <!-- Boolean Toggle -->
                  <template v-if="val.type === 'boolean'">
                    <button @click="val.value = !val.value; updateFromVisual()"
                      :class="['toggle-btn', val.value ? 'toggle-on' : 'toggle-off']">
                      <span class="toggle-slider"></span>
                    </button>
                    <span class="toggle-label">{{ val.value ? 'Enabled' : 'Disabled' }}</span>
                  </template>

                  <!-- Number Input -->
                  <template v-else-if="val.type === 'number'">
                    <input type="number" :value="val.value" @input="handleNumberInput($event, val)"
                      class="value-input number-input" />
                    <!-- Color picker if it's a color value -->
                    <template v-if="val.isColor">
                      <input type="color" :value="decimalToHex(val.value)" @input="handleColorInput($event, val)"
                        class="color-picker" title="Pick color" />
                    </template>
                  </template>

                  <!-- String Input -->
                  <template v-else-if="val.type === 'string'">
                    <input v-if="!val.isColor" type="text" :value="val.value" @input="handleStringInput($event, val)"
                      class="value-input string-input" />
                    <template v-else>
                      <input type="text" :value="val.value" @input="handleStringInput($event, val)"
                        class="value-input string-input color-text-input" />
                      <input type="color" :value="val.value" @input="handleStringInput($event, val)"
                        class="color-picker" title="Pick color" />
                    </template>
                  </template>

                  <!-- Array Editor -->
                  <template v-else-if="val.type === 'array'">
                    <div class="array-editor">
                      <div class="array-header">
                        <span class="array-count">{{ getArrayLength(val) }} items</span>
                        <button @click="addArrayItem(val)" class="array-add-btn">
                          <Plus class="w-4 h-4" />
                          Add
                        </button>
                      </div>

                      <div v-if="getArrayLength(val) > 0" class="array-items">
                        <div v-for="(item, idx) in getArrayItems(val)" :key="idx" class="array-item">
                          <span class="array-index">{{ idx }}</span>

                          <!-- String array item -->
                          <input v-if="val.arrayType === 'string'" type="text" :value="item"
                            @input="handleArrayStringInput($event, val, idx)" class="value-input array-item-input" />

                          <!-- Number array item -->
                          <input v-else-if="val.arrayType === 'number'" type="number" :value="item"
                            @input="handleArrayNumberInput($event, val, idx)" class="value-input array-item-input" />

                          <!-- Boolean array item -->
                          <button v-else-if="val.arrayType === 'boolean'" @click="updateArrayItem(val, idx, !item)"
                            :class="['toggle-btn toggle-sm', item ? 'toggle-on' : 'toggle-off']">
                            <span class="toggle-slider"></span>
                          </button>

                          <button @click="removeArrayItem(val, idx)" class="array-remove-btn" title="Remove item">
                            <Trash2 class="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div v-else class="array-empty">
                        <span>Empty array</span>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Raw Editor Mode -->
      <div v-else class="editor-content">
        <!-- Line Numbers -->
        <div class="line-numbers custom-scrollbar">
          <div v-for="n in lineCount" :key="n" :class="['line-number', n === currentLine && 'line-number-active']">
            {{ n }}
          </div>
        </div>

        <!-- Textarea -->
        <textarea ref="textareaRef" v-model="content" class="editor-textarea custom-scrollbar" spellcheck="false"
          @keydown="handleTab" @click="updateCurrentLine" @keyup="updateCurrentLine" />
      </div>

      <!-- Footer -->
      <div class="editor-footer">
        <div class="footer-stats">
          <span class="footer-stat">
            <FileText class="w-3.5 h-3.5" />
            {{ lineCount }} lines
          </span>
          <span class="footer-stat">{{ content.length.toLocaleString() }} chars</span>
          <span v-if="editorMode === 'raw'" class="footer-divider">•</span>
          <span v-if="editorMode === 'raw'" class="footer-stat">Line {{ currentLine }}</span>
        </div>
        <div class="footer-shortcuts">
          <kbd class="shortcut-key">Ctrl+S</kbd>
          <span class="shortcut-label">save</span>
          <span class="footer-divider">•</span>
          <kbd class="shortcut-key">Ctrl+F</kbd>
          <span class="shortcut-label">search</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.config-editor {
  @apply h-full flex flex-col;
  background-color: hsl(var(--background));
}

.editor-fullscreen {
  @apply fixed inset-0 z-50;
}

/* Empty State */
.empty-state {
  @apply flex-1 flex flex-col items-center justify-center text-center p-8;
}

.empty-icon {
  @apply w-20 h-20 rounded-2xl flex items-center justify-center mb-4;
  background-color: hsl(var(--muted) / 0.5);
}

/* Header */
.editor-header {
  @apply flex items-center gap-3 px-4 py-3;
  background-color: hsl(var(--muted) / 0.3);
  border-bottom: 1px solid hsl(var(--border) / 0.5);
}

.header-file-info {
  @apply flex items-center gap-3 flex-1 min-w-0;
}

.file-icon {
  @apply w-10 h-10 rounded-lg flex items-center justify-center;
  background: linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--primary) / 0.05));
  border: 1px solid hsl(var(--primary) / 0.3);
}

.type-badge {
  @apply text-xs px-2 py-0.5 rounded-md uppercase font-medium;
}

.badge-json {
  background-color: rgb(234 179 8 / 0.2);
  color: rgb(250 204 21);
}

.badge-toml {
  background-color: rgb(59 130 246 / 0.2);
  color: rgb(96 165 250);
}

.badge-yaml {
  background-color: rgb(34 197 94 / 0.2);
  color: rgb(74 222 128);
}

.badge-cfg {
  background-color: rgb(168 85 247 / 0.2);
  color: rgb(192 132 252);
}

.badge-default {
  background-color: hsl(var(--muted) / 0.5);
  color: hsl(var(--muted-foreground));
}

.header-status {
  @apply flex items-center;
}

.status-indicator {
  @apply flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium;
}

.status-modified {
  background-color: rgb(234 179 8 / 0.1);
  color: rgb(251 191 36);
}

.status-saved {
  background-color: rgb(34 197 94 / 0.1);
  color: rgb(74 222 128);
}

/* Toolbar */
.editor-toolbar {
  @apply flex items-center justify-between px-4 py-2;
  background-color: hsl(var(--muted) / 0.2);
  border-bottom: 1px solid hsl(var(--border) / 0.3);
}

.toolbar-left,
.toolbar-right {
  @apply flex items-center gap-1;
}

.toolbar-divider {
  @apply w-px h-6 mx-2;
  background-color: hsl(var(--border) / 0.5);
}

/* Mode Toggle */
.mode-toggle {
  @apply flex rounded-lg p-0.5;
  background-color: hsl(var(--muted) / 0.5);
  border: 1px solid hsl(var(--border) / 0.5);
}

.mode-btn {
  @apply flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all;
  color: hsl(var(--muted-foreground));
}

.mode-btn:hover {
  color: hsl(var(--foreground));
}

.mode-btn-active {
  background-color: hsl(var(--background));
  color: hsl(var(--primary));
  box-shadow: 0 1px 3px hsl(var(--foreground) / 0.1);
}

.toolbar-btn {
  @apply p-2 rounded-lg transition-colors;
  color: hsl(var(--muted-foreground));
}

.toolbar-btn:hover {
  color: hsl(var(--foreground));
  background-color: hsl(var(--muted) / 0.5);
}

.toolbar-btn-active {
  color: hsl(var(--primary));
  background-color: hsl(var(--primary) / 0.1);
}

/* Search Bar */
.search-bar {
  @apply flex items-center gap-3 px-4 py-2;
  background-color: hsl(var(--muted) / 0.3);
  border-bottom: 1px solid hsl(var(--border) / 0.3);
}

.search-field-wrapper {
  @apply flex-1 relative;
}

.search-field-icon {
  @apply absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4;
  color: hsl(var(--muted-foreground));
}

.search-field {
  @apply w-full pl-9 pr-4 py-1.5 rounded-lg text-sm;
  background-color: hsl(var(--muted) / 0.5);
  border: 1px solid hsl(var(--border) / 0.5);
  color: hsl(var(--foreground));
}

.search-field::placeholder {
  color: hsl(var(--muted-foreground));
}

.search-field:focus {
  @apply outline-none;
  border-color: hsl(var(--primary) / 0.5);
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
}

.search-nav {
  @apply flex items-center gap-2;
}

.search-count {
  @apply text-xs;
  color: hsl(var(--muted-foreground));
}

.search-nav-btn {
  @apply p-1.5 rounded-lg transition-colors;
  color: hsl(var(--muted-foreground));
}

.search-nav-btn:hover:not(:disabled) {
  color: hsl(var(--foreground));
  background-color: hsl(var(--muted) / 0.5);
}

.search-nav-btn:disabled {
  @apply opacity-50;
}

.search-close {
  @apply p-1.5 rounded-lg transition-colors;
  color: hsl(var(--muted-foreground));
}

.search-close:hover {
  color: hsl(var(--foreground));
  background-color: hsl(var(--muted) / 0.5);
}

/* Parse Error */
.parse-error {
  @apply flex items-center gap-3 px-4 py-2 text-sm;
  background-color: rgb(234 179 8 / 0.1);
  border-bottom: 1px solid rgb(234 179 8 / 0.2);
  color: rgb(251 191 36);
}

/* Loading */
.loading-container {
  @apply flex-1 flex flex-col items-center justify-center;
}

/* Visual Editor */
.visual-editor {
  @apply flex-1 overflow-y-auto p-4;
}

.visual-empty {
  @apply flex flex-col items-center justify-center h-full gap-3;
}

.visual-sections {
  @apply space-y-4;
}

.config-section {
  @apply rounded-xl overflow-hidden;
  background-color: hsl(var(--card) / 0.5);
  border: 1px solid hsl(var(--border) / 0.5);
}

.section-header {
  @apply flex items-center gap-2 w-full px-4 py-3 text-left transition-colors;
  background-color: hsl(var(--muted) / 0.3);
}

.section-header:hover {
  background-color: hsl(var(--muted) / 0.5);
}

.section-title {
  @apply flex-1 font-semibold text-sm;
  color: hsl(var(--foreground));
}

.section-count {
  @apply text-xs px-2 py-0.5 rounded-full;
  background-color: hsl(var(--muted) / 0.5);
  color: hsl(var(--muted-foreground));
}

.section-content {
  @apply divide-y;
  border-color: hsl(var(--border) / 0.3);
}

.config-item {
  @apply p-4 space-y-3 transition-colors;
}

.config-item:hover {
  background-color: hsl(var(--muted) / 0.1);
}

.item-header {
  @apply flex items-start gap-3;
}

.item-type-icon {
  @apply w-4 h-4 mt-0.5 flex-shrink-0;
  color: hsl(var(--muted-foreground));
}

.item-info {
  @apply flex-1 min-w-0;
}

.item-key {
  @apply font-medium text-sm block;
  color: hsl(var(--foreground));
}

.item-comment {
  @apply text-xs mt-0.5 block;
  color: hsl(var(--muted-foreground));
}

.item-type-badge {
  @apply text-[10px] px-1.5 py-0.5 rounded uppercase font-medium;
  background-color: hsl(var(--muted) / 0.5);
  color: hsl(var(--muted-foreground));
}

.item-value {
  @apply flex items-center gap-3 pl-7;
}

/* Toggle */
.toggle-btn {
  @apply relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0;
}

.toggle-btn.toggle-sm {
  @apply w-8 h-5;
}

.toggle-on {
  background-color: hsl(var(--primary));
}

.toggle-off {
  background-color: hsl(var(--muted));
}

.toggle-slider {
  @apply absolute top-1 left-1 w-4 h-4 rounded-full transition-transform;
  background-color: white;
}

.toggle-btn.toggle-sm .toggle-slider {
  @apply w-3 h-3;
}

.toggle-on .toggle-slider {
  transform: translateX(20px);
}

.toggle-btn.toggle-sm.toggle-on .toggle-slider {
  transform: translateX(12px);
}

.toggle-label {
  @apply text-sm;
  color: hsl(var(--muted-foreground));
}

/* Value Inputs */
.value-input {
  @apply flex-1 px-3 py-2 rounded-lg text-sm;
  background-color: hsl(var(--muted) / 0.3);
  border: 1px solid hsl(var(--border) / 0.5);
  color: hsl(var(--foreground));
}

.value-input:focus {
  @apply outline-none;
  border-color: hsl(var(--primary) / 0.5);
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
}

.number-input {
  @apply max-w-[200px] font-mono;
}

.color-text-input {
  @apply max-w-[200px] font-mono;
}

.color-picker {
  @apply w-10 h-10 rounded-lg cursor-pointer border-0;
  background-color: transparent;
}

.color-picker::-webkit-color-swatch {
  @apply rounded-lg;
  border: 1px solid hsl(var(--border) / 0.5);
}

/* Array Editor */
.array-editor {
  @apply w-full space-y-2;
}

.array-header {
  @apply flex items-center justify-between;
}

.array-count {
  @apply text-xs;
  color: hsl(var(--muted-foreground));
}

.array-add-btn {
  @apply flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors;
  background-color: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

.array-add-btn:hover {
  background-color: hsl(var(--primary) / 0.2);
}

.array-items {
  @apply space-y-2;
}

.array-item {
  @apply flex items-center gap-2;
}

.array-index {
  @apply w-6 text-center text-xs font-mono;
  color: hsl(var(--muted-foreground));
}

.array-item-input {
  @apply flex-1;
}

.array-remove-btn {
  @apply p-1.5 rounded-lg transition-colors;
  color: hsl(var(--muted-foreground));
}

.array-remove-btn:hover {
  color: hsl(var(--destructive));
  background-color: hsl(var(--destructive) / 0.1);
}

.array-empty {
  @apply text-center py-4 rounded-lg text-sm;
  background-color: hsl(var(--muted) / 0.2);
  color: hsl(var(--muted-foreground));
}

/* Editor Content */
.editor-content {
  @apply flex-1 overflow-hidden flex;
}

.line-numbers {
  @apply py-3 px-3 text-right select-none overflow-y-auto;
  background-color: hsl(var(--muted) / 0.2);
  border-right: 1px solid hsl(var(--border) / 0.3);
}

.line-number {
  @apply text-xs leading-6 h-6 px-1 rounded-sm font-mono;
  color: hsl(var(--muted-foreground) / 0.5);
}

.line-number-active {
  color: hsl(var(--primary));
  background-color: hsl(var(--primary) / 0.1);
}

.editor-textarea {
  @apply flex-1 p-3 resize-none outline-none font-mono text-sm leading-6;
  background-color: transparent;
  color: hsl(var(--foreground) / 0.9);
  tab-size: 2;
  -moz-tab-size: 2;
}

/* Footer */
.editor-footer {
  @apply flex items-center justify-between px-4 py-2 text-xs;
  background-color: hsl(var(--muted) / 0.2);
  border-top: 1px solid hsl(var(--border) / 0.3);
}

.footer-stats {
  @apply flex items-center gap-4;
  color: hsl(var(--muted-foreground));
}

.footer-stat {
  @apply flex items-center gap-1.5;
}

.footer-divider {
  color: hsl(var(--muted-foreground) / 0.4);
}

.footer-shortcuts {
  @apply flex items-center gap-2;
  color: hsl(var(--muted-foreground));
}

.shortcut-key {
  @apply px-1.5 py-0.5 rounded text-[10px] font-mono;
  background-color: hsl(var(--muted) / 0.5);
  border: 1px solid hsl(var(--border) / 0.5);
}

.shortcut-label {
  @apply text-[10px];
}

/* Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.2);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.3);
}
</style>
