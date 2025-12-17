<script setup lang="ts">
/**
 * ConfigEditor - Modern config file editor with sleek design
 * 
 * Features:
 * - Syntax-aware editing for TOML/JSON/YAML
 * - Line numbers with current line highlight
 * - Save/revert with keyboard shortcuts
 * - Search in file functionality
 * - Fullscreen mode
 * - External editor support
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
  FileSliders,
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
const showDiff = ref(false);
const currentLine = ref(1);

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

// Load file content
async function loadContent() {
  if (!props.file) return;

  isLoading.value = true;
  parseError.value = null;

  try {
    const result = await window.api.configs.read(props.instanceId, props.file.path);
    content.value = result.content;
    originalContent.value = result.content;

    if (result.parseError) {
      parseError.value = result.parseError;
    }
  } catch (error: any) {
    console.error("Failed to load config:", error);
    toast.error("Failed to load file", error.message);
  } finally {
    isLoading.value = false;
  }
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
  showDiff.value = false;
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

// Watch for file changes
watch(() => props.file, () => {
  if (props.file) {
    loadContent();
    showDiff.value = false;
  } else {
    content.value = "";
    originalContent.value = "";
  }
}, { immediate: true });

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
              <span class="font-medium text-foreground truncate">{{ file.name }}</span>
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
            <span>{{ changedLineCount }} line{{ changedLineCount !== 1 ? 's' : '' }} changed</span>
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
      <div v-if="parseError" class="parse-error">
        <AlertCircle class="w-4 h-4 text-amber-400" />
        <span>Parse warning: {{ parseError }}</span>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="loading-container">
        <Loader2 class="w-8 h-8 animate-spin text-primary" />
        <p class="text-sm text-muted-foreground mt-2">Loading file...</p>
      </div>

      <!-- Editor Content -->
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
          <span class="footer-divider">•</span>
          <span class="footer-stat">Line {{ currentLine }}</span>
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
