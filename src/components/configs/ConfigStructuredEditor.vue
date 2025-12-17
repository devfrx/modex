<template>
    <div class="structured-editor">
        <!-- Header -->
        <div class="editor-header">
            <div class="header-left">
                <div class="file-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14,2 14,8 20,8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                </div>
                <div class="file-info">
                    <span class="file-name">{{ fileName }}</span>
                    <span class="file-format">{{ parsedConfig?.type?.toUpperCase() || 'CONFIG' }}</span>
                </div>
            </div>

            <div class="header-actions">
                <button v-if="hasChanges" class="btn-discard" @click="discardChanges">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2" class="w-4 h-4">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                    </svg>
                    Annulla
                </button>
                <button :class="['btn-save', { 'has-changes': hasChanges }]" :disabled="!hasChanges || saving"
                    @click="saveChanges">
                    <svg v-if="saving" class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none"
                        viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                        <path class="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2" class="w-4 h-4">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                    </svg>
                    {{ saving ? 'Salvando...' : 'Salva' }}
                </button>
            </div>
        </div>

        <!-- Search Bar -->
        <div class="search-bar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" class="search-icon">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input v-model="searchQuery" type="text" placeholder="Cerca chiave o valore..." class="search-input" />
            <span v-if="searchQuery" class="search-count">
                {{ filteredEntriesCount }} risultati
            </span>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="loading-state">
            <div class="loading-spinner" />
            <span>Caricamento configurazione...</span>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="error-state">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" class="error-icon">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{{ error }}</span>
            <button class="btn-retry" @click="loadConfig">Riprova</button>
        </div>

        <!-- Flat Entries List -->
        <div v-else class="sections-container">
            <!-- Render all entries from allEntries -->
            <template v-if="filteredEntries.length > 0">
                <div v-for="entry in filteredEntries" :key="entry.keyPath"
                    :class="['config-entry', { 'modified': isModified(entry.keyPath) }]"
                    :style="{ paddingLeft: (entry.depth * 16 + 12) + 'px' }">
                    <!-- Key -->
                    <div class="entry-key">
                        <span class="key-name">{{ entry.key }}</span>
                        <span :class="['key-type', `type-${entry.type}`]">{{ entry.type }}</span>
                    </div>

                    <!-- Value Editor -->
                    <div class="entry-value">
                        <!-- Boolean Toggle -->
                        <template v-if="entry.type === 'boolean'">
                            <button :class="['bool-toggle', { 'active': getEditValue(entry.keyPath, entry.value) }]"
                                @click="toggleBoolean(entry.keyPath, entry.value)">
                                <div class="toggle-track">
                                    <div class="toggle-thumb" />
                                </div>
                                <span>{{ getEditValue(entry.keyPath, entry.value) ? 'true' : 'false' }}</span>
                            </button>
                        </template>

                        <!-- Number Input -->
                        <template v-else-if="entry.type === 'number'">
                            <input type="number" :value="getEditValue(entry.keyPath, entry.value)"
                                class="value-input number-input"
                                @change="handleNumberChange(entry.keyPath, entry.value, $event)" />
                        </template>

                        <!-- String Input -->
                        <template v-else-if="entry.type === 'string'">
                            <input type="text" :value="getEditValue(entry.keyPath, entry.value)"
                                class="value-input string-input"
                                @change="handleStringChange(entry.keyPath, entry.value, $event)" />
                        </template>

                        <!-- Array (Read-only) -->
                        <template v-else-if="entry.type === 'array'">
                            <div class="complex-value">
                                <button class="expand-btn" @click="toggleExpanded(entry.keyPath)">
                                    <svg :class="['expand-icon', { 'rotated': expandedPaths.has(entry.keyPath) }]"
                                        xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" stroke-width="2">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                    <span class="array-label">[{{ Array.isArray(entry.value) ? entry.value.length : 0 }}
                                        elementi]</span>
                                </button>
                                <pre v-if="expandedPaths.has(entry.keyPath)"
                                    class="json-preview">{{ JSON.stringify(entry.value, null, 2) }}</pre>
                            </div>
                        </template>

                        <!-- Object (Read-only) -->
                        <template v-else-if="entry.type === 'object'">
                            <div class="complex-value">
                                <button class="expand-btn" @click="toggleExpanded(entry.keyPath)">
                                    <svg :class="['expand-icon', { 'rotated': expandedPaths.has(entry.keyPath) }]"
                                        xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" stroke-width="2">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                    <span class="object-label">{`{${Object.keys(entry.value || {}).length}
                                        chiavi}`}</span>
                                </button>
                                <pre v-if="expandedPaths.has(entry.keyPath)"
                                    class="json-preview">{{ JSON.stringify(entry.value, null, 2) }}</pre>
                            </div>
                        </template>

                        <!-- Null -->
                        <template v-else-if="entry.type === 'null'">
                            <span class="null-value">null</span>
                        </template>

                        <!-- Reset Button -->
                        <button v-if="isModified(entry.keyPath)" class="reset-btn" @click="resetValue(entry.keyPath)"
                            title="Ripristina valore originale">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                            </svg>
                        </button>
                    </div>

                    <!-- Comment -->
                    <div v-if="entry.comment" class="entry-comment">
                        {{ entry.comment }}
                    </div>
                </div>
            </template>

            <!-- Empty State -->
            <div v-else class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" class="empty-icon">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 15h8M9 9h.01M15 9h.01" />
                </svg>
                <span v-if="searchQuery">Nessun risultato per "{{ searchQuery }}"</span>
                <span v-else>Nessuna configurazione trovata</span>
            </div>
        </div>

        <!-- Changes Summary -->
        <div v-if="hasChanges" class="changes-summary">
            <div class="summary-header">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" class="summary-icon">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>{{ modificationCount }} modifiche in sospeso</span>
            </div>
            <div class="changes-list">
                <div v-for="(value, keyPath) in editedValues" :key="keyPath" class="change-item">
                    <span class="change-key">{{ keyPath }}</span>
                    <span class="change-arrow">→</span>
                    <span class="change-value">{{ formatValue(value) }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive } from 'vue';

interface ConfigEntry {
    keyPath: string;
    key: string;
    value: any;
    originalValue: any;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
    comment?: string;
    section?: string;
    depth: number;
    modified: boolean;
}

interface ConfigSection {
    name: string;
    displayName: string;
    entries: ConfigEntry[];
    subsections: ConfigSection[];
    expanded: boolean;
}

interface ParsedConfig {
    path: string;
    type: string;
    sections: ConfigSection[];
    allEntries: ConfigEntry[];
    errors: string[];
    rawContent: string;
    encoding: string;
}

const props = defineProps<{
    instanceId: string;
    configPath: string;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'saved'): void;
}>();

// State
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const parsedConfig = ref<ParsedConfig | null>(null);
const editedValues = reactive<Record<string, any>>({});
const expandedPaths = ref(new Set<string>());
const searchQuery = ref('');

// Computed
const fileName = computed(() => {
    const parts = props.configPath.split(/[/\\]/);
    return parts[parts.length - 1] || 'config';
});

const hasChanges = computed(() => Object.keys(editedValues).length > 0);

const modificationCount = computed(() => Object.keys(editedValues).length);

const filteredEntries = computed(() => {
    if (!parsedConfig.value?.allEntries) return [];

    const entries = parsedConfig.value.allEntries;

    if (!searchQuery.value.trim()) {
        return entries;
    }

    const query = searchQuery.value.toLowerCase();
    return entries.filter(entry =>
        entry.key.toLowerCase().includes(query) ||
        entry.keyPath.toLowerCase().includes(query) ||
        String(entry.value).toLowerCase().includes(query)
    );
});

const filteredEntriesCount = computed(() => filteredEntries.value.length);

// Methods
const loadConfig = async () => {
    loading.value = true;
    error.value = null;

    try {
        const result = await window.api.configs.parseStructured(props.instanceId, props.configPath);
        parsedConfig.value = result as ParsedConfig;

        // Clear edited values
        Object.keys(editedValues).forEach(key => delete editedValues[key]);
    } catch (err: any) {
        error.value = err.message || 'Errore nel caricamento della configurazione';
        console.error('Failed to load structured config:', err);
    } finally {
        loading.value = false;
    }
};

const getEditValue = (keyPath: string, originalValue: any) => {
    return keyPath in editedValues ? editedValues[keyPath] : originalValue;
};

const isModified = (keyPath: string) => {
    return keyPath in editedValues;
};

const setEditedValue = (keyPath: string, newValue: any, originalValue: any) => {
    // Deep equality check for the original value
    if (JSON.stringify(newValue) === JSON.stringify(originalValue)) {
        delete editedValues[keyPath];
    } else {
        editedValues[keyPath] = newValue;
    }
};

const handleNumberChange = (keyPath: string, originalValue: any, event: Event) => {
    const target = event.target as HTMLInputElement;
    const newValue = parseFloat(target.value);
    if (!isNaN(newValue)) {
        setEditedValue(keyPath, newValue, originalValue);
    }
};

const handleStringChange = (keyPath: string, originalValue: any, event: Event) => {
    const target = event.target as HTMLInputElement;
    setEditedValue(keyPath, target.value, originalValue);
};

const toggleBoolean = (keyPath: string, originalValue: any) => {
    const currentValue = getEditValue(keyPath, originalValue);
    setEditedValue(keyPath, !currentValue, originalValue);
};

const resetValue = (keyPath: string) => {
    delete editedValues[keyPath];
};

const toggleExpanded = (keyPath: string) => {
    if (expandedPaths.value.has(keyPath)) {
        expandedPaths.value.delete(keyPath);
    } else {
        expandedPaths.value.add(keyPath);
    }
};

const formatValue = (value: any): string => {
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
};

const discardChanges = () => {
    Object.keys(editedValues).forEach(key => delete editedValues[key]);
};

const saveChanges = async () => {
    if (!hasChanges.value || saving.value) return;

    saving.value = true;

    try {
        // Build modifications list
        const modifications = Object.entries(editedValues).map(([keyPath, newValue]) => {
            // Find original entry
            const entry = parsedConfig.value?.allEntries.find(e => e.keyPath === keyPath);

            return {
                key: keyPath,
                oldValue: entry?.originalValue ?? entry?.value,
                newValue,
                section: entry?.section
            };
        });

        console.log('[ConfigStructuredEditor] Saving modifications:', {
            instanceId: props.instanceId,
            configPath: props.configPath,
            modifications,
            editedValues: { ...editedValues }
        });

        await window.api.configs.saveStructured(props.instanceId, props.configPath, modifications);

        console.log('[ConfigStructuredEditor] Save successful, reloading...');

        // Reset edited values and reload
        Object.keys(editedValues).forEach(key => delete editedValues[key]);
        await loadConfig();

        emit('saved');
    } catch (err: any) {
        error.value = err.message || 'Errore nel salvataggio';
        console.error('Failed to save structured config:', err);
    } finally {
        saving.value = false;
    }
};

// Watch for prop changes
watch(() => [props.instanceId, props.configPath], () => {
    Object.keys(editedValues).forEach(key => delete editedValues[key]);
    loadConfig();
});

// Load on mount
onMounted(() => {
    loadConfig();
});
</script>

<style scoped>
.structured-editor {
    @apply flex flex-col h-full bg-black/40 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden;
}

/* Header */
.editor-header {
    @apply flex items-center justify-between p-4 border-b border-white/10 bg-white/5 shrink-0;
}

.header-left {
    @apply flex items-center gap-3;
}

.file-icon {
    @apply w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-white/10;
}

.file-icon svg {
    @apply w-5 h-5 text-purple-400;
}

.file-info {
    @apply flex flex-col;
}

.file-name {
    @apply font-medium text-white;
}

.file-format {
    @apply text-xs text-white/50 font-mono;
}

.header-actions {
    @apply flex items-center gap-2;
}

.btn-discard {
    @apply flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all text-sm;
}

.btn-save {
    @apply flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 border border-white/10 text-white/50 transition-all text-sm;
}

.btn-save.has-changes {
    @apply bg-gradient-to-r from-green-500 to-emerald-500 border-green-400/50 text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40;
}

.btn-save:disabled {
    @apply opacity-50 cursor-not-allowed;
}

/* Search Bar */
.search-bar {
    @apply relative flex items-center p-3 border-b border-white/5 shrink-0;
}

.search-icon {
    @apply absolute left-6 w-4 h-4 text-white/40;
}

.search-input {
    @apply flex-1 bg-white/5 rounded-lg py-2 pl-10 pr-4 text-white placeholder-white/30 text-sm border border-transparent focus:border-purple-500/50 focus:outline-none transition-colors;
}

.search-count {
    @apply absolute right-6 text-xs text-white/40;
}

/* Loading & Error States */
.loading-state,
.error-state {
    @apply flex flex-col items-center justify-center py-16 gap-4 text-white/60;
}

.loading-spinner {
    @apply w-8 h-8 border-2 border-white/20 border-t-purple-500 rounded-full animate-spin;
}

.error-icon {
    @apply w-12 h-12 text-red-400;
}

.btn-retry {
    @apply px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors;
}

/* Sections Container */
.sections-container {
    @apply flex-1 overflow-y-auto p-2;
}

/* Config Entry */
.config-entry {
    @apply flex flex-wrap items-center gap-3 py-2 px-3 rounded-lg mb-1 hover:bg-white/5 transition-colors border-l-2 border-transparent;
}

.config-entry.modified {
    @apply bg-purple-500/10 border-l-purple-500;
}

/* Entry Key */
.entry-key {
    @apply flex items-center gap-2 min-w-[180px] max-w-[250px];
}

.key-name {
    @apply font-mono text-sm text-white/90 truncate;
}

.key-type {
    @apply text-[10px] px-1.5 py-0.5 rounded font-medium uppercase shrink-0;
}

.type-string {
    @apply bg-green-500/20 text-green-400;
}

.type-number {
    @apply bg-blue-500/20 text-blue-400;
}

.type-boolean {
    @apply bg-yellow-500/20 text-yellow-400;
}

.type-array {
    @apply bg-purple-500/20 text-purple-400;
}

.type-object {
    @apply bg-orange-500/20 text-orange-400;
}

.type-null {
    @apply bg-gray-500/20 text-gray-400;
}

/* Entry Value */
.entry-value {
    @apply flex items-center gap-2 flex-1 min-w-0;
}

.value-input {
    @apply flex-1 bg-black/30 rounded-lg px-3 py-1.5 text-white text-sm border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors font-mono min-w-0;
}

.number-input {
    @apply max-w-[120px];
}

.string-input {
    @apply max-w-[300px];
}

/* Boolean Toggle */
.bool-toggle {
    @apply flex items-center gap-2 cursor-pointer;
}

.toggle-track {
    @apply w-10 h-5 rounded-full bg-white/10 relative transition-colors;
}

.bool-toggle.active .toggle-track {
    @apply bg-green-500;
}

.toggle-thumb {
    @apply absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform;
}

.bool-toggle.active .toggle-thumb {
    @apply translate-x-5;
}

.bool-toggle span {
    @apply text-sm font-mono text-white/70;
}

/* Complex Value */
.complex-value {
    @apply flex-1 min-w-0;
}

.expand-btn {
    @apply flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors;
}

.expand-icon {
    @apply w-4 h-4 transition-transform shrink-0;
}

.expand-icon.rotated {
    @apply rotate-90;
}

.array-label,
.object-label {
    @apply text-purple-400 font-mono text-xs;
}

.json-preview {
    @apply mt-2 p-3 bg-black/40 rounded-lg text-xs text-white/70 font-mono overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all;
}

.null-value {
    @apply text-sm font-mono text-gray-400 italic;
}

/* Reset Button */
.reset-btn {
    @apply p-1.5 rounded-lg bg-white/5 hover:bg-orange-500/20 text-white/50 hover:text-orange-400 transition-colors shrink-0;
}

.reset-btn svg {
    @apply w-4 h-4;
}

/* Entry Comment */
.entry-comment {
    @apply w-full text-xs text-white/40 italic mt-1;
}

/* Empty State */
.empty-state {
    @apply flex flex-col items-center justify-center py-12 gap-3 text-white/50;
}

.empty-icon {
    @apply w-16 h-16 text-white/20;
}

/* Changes Summary */
.changes-summary {
    @apply border-t border-white/10 bg-gradient-to-r from-purple-500/10 to-blue-500/10 p-4 shrink-0;
}

.summary-header {
    @apply flex items-center gap-2 text-sm font-medium text-white mb-3;
}

.summary-icon {
    @apply w-4 h-4 text-purple-400;
}

.changes-list {
    @apply space-y-1 max-h-[80px] overflow-y-auto;
}

.change-item {
    @apply flex items-center gap-2 text-xs font-mono;
}

.change-key {
    @apply text-white/60 truncate max-w-[150px];
}

.change-arrow {
    @apply text-purple-400 shrink-0;
}

.change-value {
    @apply text-green-400 truncate max-w-[150px];
}
</style>
