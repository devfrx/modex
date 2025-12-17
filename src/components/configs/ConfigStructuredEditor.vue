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
                <!-- Mode Toggle (Visual/Raw) -->
                <div class="mode-toggle">
                    <button class="mode-btn" :class="{ active: editorMode === 'visual' }" @click="switchToVisualMode"
                        title="Editor Visuale">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" class="w-4 h-4">
                            <rect x="3" y="3" width="7" height="7" />
                            <rect x="14" y="3" width="7" height="7" />
                            <rect x="14" y="14" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" />
                        </svg>
                        Visual
                    </button>
                    <button class="mode-btn" :class="{ active: editorMode === 'raw' }" @click="switchToRawMode"
                        title="Editor Raw">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" class="w-4 h-4">
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                        </svg>
                        Raw
                    </button>
                </div>

                <div class="header-divider"></div>

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

        <!-- Loading State -->
        <div v-if="loading" class="loading-state">
            <div class="loading-spinner" />
            <span>Caricamento configurazione...</span>
        </div>

        <!-- Error State -->
        <div v-else-if="error && editorMode === 'visual'" class="error-state">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" class="error-icon">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{{ error }}</span>
            <div class="error-actions">
                <button class="btn-retry" @click="loadConfig">Riprova</button>
                <button class="btn-raw-fallback" @click="editorMode = 'raw'">Modifica in Raw</button>
            </div>
        </div>

        <!-- VISUAL MODE -->
        <template v-else-if="editorMode === 'visual'">
            <!-- Search Bar -->
            <div class="search-bar">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" class="search-icon">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input v-model="searchQuery" type="text" placeholder="Cerca chiave o valore..." class="search-input"
                    @keydown.ctrl.f.prevent />
                <span v-if="searchQuery" class="search-count">
                    {{ filteredEntriesCount }} risultati
                </span>
            </div>

            <!-- Sections View -->
            <div class="visual-content">
                <!-- Grouped by sections -->
                <template v-if="groupedSections.length > 0">
                    <div v-for="section in groupedSections" :key="section.name" class="config-section">
                        <!-- Section Header -->
                        <button class="section-header" @click="toggleSection(section.name)">
                            <svg :class="['section-chevron', { 'rotated': expandedSections.has(section.name) }]"
                                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                            <span class="section-name">{{ section.displayName || section.name || 'Generale' }}</span>
                            <span class="section-count">{{ section.entries.length }} opzioni</span>
                        </button>

                        <!-- Section Content -->
                        <div v-if="expandedSections.has(section.name)" class="section-content">
                            <div v-for="entry in filterSectionEntries(section.entries)" :key="entry.keyPath"
                                :class="['config-card', { 'modified': isModified(entry.keyPath) }]">
                                <!-- Card Header -->
                                <div class="card-header">
                                    <div class="card-key">
                                        <span class="key-name">{{ entry.key }}</span>
                                        <span :class="['key-type', `type-${entry.type}`]">{{ entry.type }}</span>
                                    </div>
                                    <button v-if="isModified(entry.keyPath)" class="reset-btn"
                                        @click="resetValue(entry.keyPath)" title="Ripristina valore originale">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                            stroke="currentColor" stroke-width="2">
                                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                            <path d="M3 3v5h5" />
                                        </svg>
                                    </button>
                                </div>

                                <!-- Card Value -->
                                <div class="card-value">
                                    <!-- Boolean Toggle -->
                                    <template v-if="entry.type === 'boolean'">
                                        <button
                                            :class="['bool-toggle', { 'active': getEditValue(entry.keyPath, entry.value) }]"
                                            @click="toggleBoolean(entry.keyPath, entry.value)">
                                            <div class="toggle-track">
                                                <div class="toggle-thumb" />
                                            </div>
                                            <span>{{ getEditValue(entry.keyPath, entry.value) ? 'Attivo' : 'Disattivo'
                                            }}</span>
                                        </button>
                                    </template>

                                    <!-- Number Input -->
                                    <template v-else-if="entry.type === 'number'">
                                        <input type="number" :value="getEditValue(entry.keyPath, entry.value)"
                                            class="value-input number-input"
                                            @change="handleNumberChange(entry.keyPath, entry.value, $event)" />
                                    </template>

                                    <!-- String Input with Color Detection -->
                                    <template v-else-if="entry.type === 'string'">
                                        <!-- Color picker for color-related keys -->
                                        <div v-if="isColorKey(entry.key)" class="color-input-wrapper">
                                            <input type="color" :value="getColorValue(entry.keyPath, entry.value)"
                                                class="color-picker"
                                                @input="handleColorChange(entry.keyPath, entry.value, $event)" />
                                            <input type="text" :value="getEditValue(entry.keyPath, entry.value)"
                                                class="value-input color-text-input"
                                                @change="handleStringChange(entry.keyPath, entry.value, $event)" />
                                        </div>
                                        <input v-else type="text" :value="getEditValue(entry.keyPath, entry.value)"
                                            class="value-input string-input"
                                            @change="handleStringChange(entry.keyPath, entry.value, $event)" />
                                    </template>

                                    <!-- Array Editor -->
                                    <template v-else-if="entry.type === 'array'">
                                        <div class="array-editor-card">
                                            <button class="array-toggle" @click="toggleExpanded(entry.keyPath)">
                                                <svg :class="['expand-icon', { 'rotated': expandedPaths.has(entry.keyPath) }]"
                                                    xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                                    stroke="currentColor" stroke-width="2">
                                                    <polyline points="9 18 15 12 9 6" />
                                                </svg>
                                                <span class="array-count">{{ getArrayLength(entry) }} elementi</span>
                                            </button>

                                            <div v-if="expandedPaths.has(entry.keyPath)" class="array-items-card">
                                                <div v-for="(item, index) in getArrayValue(entry)" :key="index"
                                                    class="array-item">
                                                    <span class="array-index">#{{ index + 1 }}</span>

                                                    <input v-if="typeof item === 'string'" type="text" :value="item"
                                                        class="array-item-input"
                                                        @change="updateArrayItemFromEvent(entry.keyPath, entry.value, index, $event)" />

                                                    <input v-else-if="typeof item === 'number'" type="number"
                                                        :value="item" class="array-item-input"
                                                        @change="updateArrayItemNumber(entry.keyPath, entry.value, index, $event)" />

                                                    <button v-else-if="typeof item === 'boolean'"
                                                        :class="['bool-toggle', 'small', { 'active': item }]"
                                                        @click="updateArrayItem(entry.keyPath, entry.value, index, !item)">
                                                        <div class="toggle-track">
                                                            <div class="toggle-thumb" />
                                                        </div>
                                                    </button>

                                                    <span v-else class="complex-item">{{ JSON.stringify(item) }}</span>

                                                    <button class="array-remove-btn"
                                                        @click="removeArrayItem(entry.keyPath, entry.value, index)"
                                                        title="Rimuovi">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                                                            fill="none" stroke="currentColor" stroke-width="2">
                                                            <polyline points="3 6 5 6 21 6" />
                                                            <path
                                                                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                        </svg>
                                                    </button>
                                                </div>

                                                <!-- Empty array message -->
                                                <div v-if="getArrayLength(entry) === 0" class="array-empty">
                                                    Nessun elemento
                                                </div>

                                                <!-- Add new item -->
                                                <div class="array-add-row">
                                                    <input type="text" v-model="newArrayItems[entry.keyPath]"
                                                        placeholder="Nuovo valore..." class="array-add-input"
                                                        @keyup.enter="addArrayItem(entry.keyPath, entry.value)" />
                                                    <button class="array-add-btn"
                                                        @click="addArrayItem(entry.keyPath, entry.value)">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                                                            fill="none" stroke="currentColor" stroke-width="2">
                                                            <line x1="12" y1="5" x2="12" y2="19" />
                                                            <line x1="5" y1="12" x2="19" y2="12" />
                                                        </svg>
                                                        Aggiungi
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </template>

                                    <!-- Object (Expandable) -->
                                    <template v-else-if="entry.type === 'object'">
                                        <div class="object-preview">
                                            <button class="object-toggle" @click="toggleExpanded(entry.keyPath)">
                                                <svg :class="['expand-icon', { 'rotated': expandedPaths.has(entry.keyPath) }]"
                                                    xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                                    stroke="currentColor" stroke-width="2">
                                                    <polyline points="9 18 15 12 9 6" />
                                                </svg>
                                                <span class="object-count">{{ getObjectKeyCount(entry.value) }}
                                                    chiavi</span>
                                            </button>
                                            <pre v-if="expandedPaths.has(entry.keyPath)"
                                                class="json-preview">{{ JSON.stringify(entry.value, null, 2) }}</pre>
                                        </div>
                                    </template>

                                    <!-- Null -->
                                    <template v-else-if="entry.type === 'null'">
                                        <span class="null-value">null</span>
                                    </template>
                                </div>

                                <!-- Card Comment -->
                                <div v-if="entry.comment" class="card-comment">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" stroke-width="2" class="comment-icon">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="16" x2="12" y2="12" />
                                        <line x1="12" y1="8" x2="12.01" y2="8" />
                                    </svg>
                                    {{ entry.comment }}
                                </div>
                            </div>
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
        </template>

        <!-- RAW MODE -->
        <template v-else-if="editorMode === 'raw'">
            <div class="raw-editor-container">
                <div class="raw-toolbar">
                    <span class="raw-hint">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" class="w-4 h-4">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        Modifica il file direttamente. Ctrl+S per salvare.
                    </span>
                    <span class="raw-encoding">{{ parsedConfig?.encoding || 'UTF-8' }}</span>
                </div>
                <textarea ref="rawTextarea" v-model="rawContent" class="raw-textarea" spellcheck="false"
                    @keydown.ctrl.s.prevent="saveRawContent"></textarea>
            </div>
        </template>

        <!-- Changes Summary -->
        <div v-if="hasChanges && editorMode === 'visual'" class="changes-summary">
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
import { ref, computed, onMounted, watch, reactive, nextTick } from 'vue';

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

interface GroupedSection {
    name: string;
    displayName: string;
    entries: ConfigEntry[];
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
const expandedSections = ref(new Set<string>());
const searchQuery = ref('');
const editorMode = ref<'visual' | 'raw'>('visual');
const newArrayItems = reactive<Record<string, string>>({});
const rawContent = ref('');
const rawTextarea = ref<HTMLTextAreaElement | null>(null);
const originalRawContent = ref('');

// Color key detection patterns
const colorKeyPatterns = ['color', 'colour', 'tint', 'hue', 'rgb', 'hex'];

// Computed
const fileName = computed(() => {
    const parts = props.configPath.split(/[/\\]/);
    return parts[parts.length - 1] || 'config';
});

const hasChanges = computed(() => {
    if (editorMode.value === 'raw') {
        return rawContent.value !== originalRawContent.value;
    }
    return Object.keys(editedValues).length > 0;
});

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

// Group entries by section for visual mode
const groupedSections = computed((): GroupedSection[] => {
    if (!parsedConfig.value?.allEntries) return [];

    const entries = filteredEntries.value;
    const sectionMap = new Map<string, ConfigEntry[]>();

    // Group entries by their section
    for (const entry of entries) {
        const sectionName = entry.section || '';
        if (!sectionMap.has(sectionName)) {
            sectionMap.set(sectionName, []);
        }
        sectionMap.get(sectionName)!.push(entry);
    }

    // Convert to array and sort
    const sections: GroupedSection[] = [];
    for (const [name, sectionEntries] of sectionMap) {
        sections.push({
            name: name,
            displayName: formatSectionName(name),
            entries: sectionEntries
        });
    }

    // Sort sections: empty name first (general), then alphabetically
    sections.sort((a, b) => {
        if (a.name === '') return -1;
        if (b.name === '') return 1;
        return a.name.localeCompare(b.name);
    });

    return sections;
});

// Methods
const formatSectionName = (name: string): string => {
    if (!name) return 'Generale';
    // Convert snake_case or camelCase to Title Case
    return name
        .replace(/[._]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, l => l.toUpperCase());
};

const loadConfig = async () => {
    loading.value = true;
    error.value = null;

    try {
        const result = await window.api.configs.parseStructured(props.instanceId, props.configPath);
        parsedConfig.value = result as ParsedConfig;

        // Store raw content
        rawContent.value = result.rawContent || '';
        originalRawContent.value = result.rawContent || '';

        // Clear edited values
        Object.keys(editedValues).forEach(key => delete editedValues[key]);

        // Expand the first section by default
        if (groupedSections.value.length > 0) {
            expandedSections.value.add(groupedSections.value[0].name);
        }
    } catch (err: any) {
        error.value = err.message || 'Errore nel caricamento della configurazione';
        console.error('Failed to load structured config:', err);
        // Switch to raw mode on error if we have raw content
        if (rawContent.value) {
            editorMode.value = 'raw';
        }
    } finally {
        loading.value = false;
    }
};

const switchToVisualMode = () => {
    if (editorMode.value === 'raw' && rawContent.value !== originalRawContent.value) {
        // Content was modified in raw mode, need to reload
        // For now, just switch and lose changes (could add a confirmation dialog)
    }
    editorMode.value = 'visual';
};

const switchToRawMode = async () => {
    editorMode.value = 'raw';
    await nextTick();
    rawTextarea.value?.focus();
};

const toggleSection = (sectionName: string) => {
    if (expandedSections.value.has(sectionName)) {
        expandedSections.value.delete(sectionName);
    } else {
        expandedSections.value.add(sectionName);
    }
};

const filterSectionEntries = (entries: ConfigEntry[]): ConfigEntry[] => {
    if (!searchQuery.value.trim()) return entries;

    const query = searchQuery.value.toLowerCase();
    return entries.filter(entry =>
        entry.key.toLowerCase().includes(query) ||
        entry.keyPath.toLowerCase().includes(query) ||
        String(entry.value).toLowerCase().includes(query)
    );
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

// Color helpers
const isColorKey = (key: string): boolean => {
    const lowerKey = key.toLowerCase();
    return colorKeyPatterns.some(pattern => lowerKey.includes(pattern));
};

const getColorValue = (keyPath: string, originalValue: any): string => {
    const value = getEditValue(keyPath, originalValue);
    // Try to parse as hex color
    if (typeof value === 'string') {
        if (value.startsWith('#')) return value;
        if (value.startsWith('0x')) return '#' + value.slice(2);
        // Check if it's a valid hex without prefix
        if (/^[0-9A-Fa-f]{6}$/.test(value)) return '#' + value;
    }
    return '#000000';
};

const handleColorChange = (keyPath: string, originalValue: any, event: Event) => {
    const target = event.target as HTMLInputElement;
    const hexColor = target.value;
    // Keep the same format as original
    const original = String(originalValue);
    let newValue = hexColor;
    if (original.startsWith('0x')) {
        newValue = '0x' + hexColor.slice(1);
    } else if (!original.startsWith('#') && /^[0-9A-Fa-f]{6}$/.test(original)) {
        newValue = hexColor.slice(1);
    }
    setEditedValue(keyPath, newValue, originalValue);
};

// Object helper
const getObjectKeyCount = (value: any): number => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value).length;
    }
    return 0;
};

// Array helper functions
const getArrayLength = (entry: ConfigEntry): number => {
    const value = getEditValue(entry.keyPath, entry.value);
    return Array.isArray(value) ? value.length : 0;
};

const getArrayValue = (entry: ConfigEntry): any[] => {
    const value = getEditValue(entry.keyPath, entry.value);
    return Array.isArray(value) ? value : [];
};

const updateArrayItem = (keyPath: string, originalValue: any, index: number, newItemValue: any) => {
    const currentArray = [...getEditValue(keyPath, originalValue)];
    currentArray[index] = newItemValue;
    setEditedValue(keyPath, currentArray, originalValue);
};

const updateArrayItemFromEvent = (keyPath: string, originalValue: any, index: number, event: Event) => {
    const target = event.target as HTMLInputElement;
    updateArrayItem(keyPath, originalValue, index, target.value);
};

const updateArrayItemNumber = (keyPath: string, originalValue: any, index: number, event: Event) => {
    const target = event.target as HTMLInputElement;
    const newValue = parseFloat(target.value);
    if (!isNaN(newValue)) {
        updateArrayItem(keyPath, originalValue, index, newValue);
    }
};

const removeArrayItem = (keyPath: string, originalValue: any, index: number) => {
    const currentArray = [...getEditValue(keyPath, originalValue)];
    currentArray.splice(index, 1);
    setEditedValue(keyPath, currentArray, originalValue);
};

const addArrayItem = (keyPath: string, originalValue: any) => {
    const newValue = newArrayItems[keyPath];
    if (!newValue || newValue.trim() === '') return;

    const currentArray = [...getEditValue(keyPath, originalValue)];

    // Try to infer type from existing items
    const firstItem = currentArray[0];
    let typedValue: any = newValue;

    if (typeof firstItem === 'number') {
        const parsed = parseFloat(newValue);
        if (!isNaN(parsed)) typedValue = parsed;
    } else if (typeof firstItem === 'boolean') {
        typedValue = newValue.toLowerCase() === 'true';
    }

    currentArray.push(typedValue);
    setEditedValue(keyPath, currentArray, originalValue);
    newArrayItems[keyPath] = '';
};

const formatValue = (value: any): string => {
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
};

const discardChanges = () => {
    if (editorMode.value === 'raw') {
        rawContent.value = originalRawContent.value;
    } else {
        Object.keys(editedValues).forEach(key => delete editedValues[key]);
    }
};

const saveChanges = async () => {
    if (!hasChanges.value || saving.value) return;

    saving.value = true;

    try {
        if (editorMode.value === 'raw') {
            await saveRawContent();
        } else {
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
        }

        emit('saved');
    } catch (err: any) {
        error.value = err.message || 'Errore nel salvataggio';
        console.error('Failed to save structured config:', err);
    } finally {
        saving.value = false;
    }
};

const saveRawContent = async () => {
    try {
        await window.api.configs.write(props.instanceId, props.configPath, rawContent.value);
        originalRawContent.value = rawContent.value;
        console.log('[ConfigStructuredEditor] Raw save successful');
        // Reload to get updated parsed config
        await loadConfig();
    } catch (err: any) {
        error.value = err.message || 'Errore nel salvataggio';
        console.error('Failed to save raw config:', err);
        throw err;
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
    @apply flex flex-col h-full bg-black/40 backdrop-blur-xl border border-white/10 overflow-hidden;
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
    @apply text-xs text-white/50 font-mono px-1.5 py-0.5 bg-white/10 rounded;
}

.header-actions {
    @apply flex items-center gap-3;
}

.header-divider {
    @apply w-px h-6 bg-white/10;
}

/* Mode Toggle */
.mode-toggle {
    @apply flex items-center bg-white/5 rounded-lg p-1 border border-white/10;
}

.mode-btn {
    @apply flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white/50 text-sm font-medium transition-all;
}

.mode-btn:hover {
    @apply text-white/70;
}

.mode-btn.active {
    @apply bg-purple-500/30 text-purple-300 shadow-sm;
}

.mode-btn svg {
    @apply w-4 h-4;
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

.error-actions {
    @apply flex items-center gap-2;
}

.btn-retry {
    @apply px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors;
}

.btn-raw-fallback {
    @apply px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg text-sm transition-colors;
}

/* Visual Content */
.visual-content {
    @apply flex-1 overflow-y-auto p-4 space-y-3;
}

/* Config Section */
.config-section {
    @apply bg-white/5 rounded-xl border border-white/10 overflow-hidden;
}

.section-header {
    @apply w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors;
}

.section-chevron {
    @apply w-4 h-4 text-white/40 transition-transform shrink-0;
}

.section-chevron.rotated {
    @apply rotate-90;
}

.section-name {
    @apply flex-1 font-medium text-white;
}

.section-count {
    @apply text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full;
}

.section-content {
    @apply p-3 pt-0 space-y-2;
}

/* Config Card */
.config-card {
    @apply bg-black/20 rounded-lg p-3 border border-transparent transition-all hover:border-white/10;
}

.config-card.modified {
    @apply border-purple-500/50 bg-purple-500/10;
}

.card-header {
    @apply flex items-center justify-between mb-2;
}

.card-key {
    @apply flex items-center gap-2;
}

.key-name {
    @apply font-mono text-sm text-white/90;
}

.key-type {
    @apply text-[10px] px-1.5 py-0.5 rounded font-medium uppercase;
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

.card-value {
    @apply flex items-start;
}

.card-comment {
    @apply flex items-start gap-1.5 mt-2 pt-2 border-t border-white/5 text-xs text-white/40 italic;
}

.comment-icon {
    @apply w-3 h-3 shrink-0 mt-0.5;
}

/* Value Inputs */
.value-input {
    @apply bg-black/30 rounded-lg px-3 py-2 text-white text-sm border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors font-mono;
}

.number-input {
    @apply w-32;
}

.string-input {
    @apply flex-1 max-w-full;
}

/* Color Input */
.color-input-wrapper {
    @apply flex items-center gap-2 flex-1;
}

.color-picker {
    @apply w-10 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent;
}

.color-text-input {
    @apply flex-1 bg-black/30 rounded-lg px-3 py-2 text-white text-sm border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors font-mono;
}

/* Boolean Toggle */
.bool-toggle {
    @apply flex items-center gap-3 cursor-pointer;
}

.toggle-track {
    @apply w-12 h-6 rounded-full bg-white/10 relative transition-colors;
}

.bool-toggle.active .toggle-track {
    @apply bg-green-500;
}

.toggle-thumb {
    @apply absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform;
}

.bool-toggle.active .toggle-thumb {
    @apply translate-x-6;
}

.bool-toggle span {
    @apply text-sm text-white/70;
}

/* Small toggle for arrays */
.bool-toggle.small .toggle-track {
    @apply w-8 h-4;
}

.bool-toggle.small .toggle-thumb {
    @apply w-3 h-3 top-0.5 left-0.5;
}

.bool-toggle.small.active .toggle-thumb {
    @apply translate-x-4;
}

/* Array Editor Card */
.array-editor-card {
    @apply flex-1;
}

.array-toggle {
    @apply flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors;
}

.array-count {
    @apply text-purple-400 font-mono text-xs;
}

.array-items-card {
    @apply mt-3 space-y-1 bg-black/20 rounded-lg p-2 border border-white/5;
}

.array-item {
    @apply flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white/5 transition-colors;
}

.array-index {
    @apply text-xs font-mono text-white/30 w-6 shrink-0;
}

.array-item-input {
    @apply flex-1 bg-black/30 rounded px-2 py-1.5 text-sm font-mono text-white border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors;
}

.complex-item {
    @apply flex-1 text-xs font-mono text-white/50 truncate;
}

.array-remove-btn {
    @apply p-1.5 rounded hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors shrink-0;
}

.array-remove-btn svg {
    @apply w-4 h-4;
}

.array-empty {
    @apply text-center py-3 text-sm text-white/30 italic;
}

.array-add-row {
    @apply flex items-center gap-2 mt-2 pt-2 border-t border-white/5;
}

.array-add-input {
    @apply flex-1 bg-black/30 rounded px-2 py-1.5 text-sm font-mono text-white placeholder-white/30 border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors;
}

.array-add-btn {
    @apply flex items-center gap-1 px-3 py-1.5 rounded bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs font-medium transition-colors;
}

.array-add-btn svg {
    @apply w-4 h-4;
}

/* Object Preview */
.object-preview {
    @apply flex-1;
}

.object-toggle {
    @apply flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors;
}

.object-count {
    @apply text-orange-400 font-mono text-xs;
}

.expand-icon {
    @apply w-4 h-4 transition-transform shrink-0;
}

.expand-icon.rotated {
    @apply rotate-90;
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

/* Empty State */
.empty-state {
    @apply flex flex-col items-center justify-center py-12 gap-3 text-white/50;
}

.empty-icon {
    @apply w-16 h-16 text-white/20;
}

/* Raw Editor */
.raw-editor-container {
    @apply flex-1 flex flex-col overflow-hidden;
}

.raw-toolbar {
    @apply flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/5;
}

.raw-hint {
    @apply flex items-center gap-2 text-xs text-white/40;
}

.raw-encoding {
    @apply text-xs font-mono text-white/30 bg-white/10 px-2 py-0.5 rounded;
}

.raw-textarea {
    @apply flex-1 w-full p-4 bg-transparent text-white font-mono text-sm resize-none focus:outline-none;
    line-height: 1.6;
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
