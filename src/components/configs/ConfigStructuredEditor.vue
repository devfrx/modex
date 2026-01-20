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

                                                    <!-- Object Item (Complex) -->
                                                    <div v-else-if="typeof item === 'object' && item !== null"
                                                        class="array-object-item">
                                                        <button class="object-item-toggle"
                                                            @click="toggleExpanded(`${entry.keyPath}[${index}]`)">
                                                            <svg :class="['expand-icon', { 'rotated': expandedPaths.has(`${entry.keyPath}[${index}]`) }]"
                                                                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                                                                fill="none" stroke="currentColor" stroke-width="2">
                                                                <polyline points="9 18 15 12 9 6" />
                                                            </svg>
                                                            <span class="object-item-type">{{ Array.isArray(item) ?
                                                                'array' : 'object' }}</span>
                                                            <span class="object-item-preview">{{ getObjectPreview(item)
                                                            }}</span>
                                                        </button>

                                                        <!-- Expanded Object Editor -->
                                                        <div v-if="expandedPaths.has(`${entry.keyPath}[${index}]`)"
                                                            class="object-item-content">
                                                            <template v-if="Array.isArray(item)">
                                                                <!-- Nested Array -->
                                                                <div v-for="(nestedItem, nestedIdx) in item"
                                                                    :key="nestedIdx" class="nested-item">
                                                                    <span class="nested-index">[{{ nestedIdx }}]</span>
                                                                    <input v-if="typeof nestedItem === 'string'"
                                                                        type="text" :value="nestedItem"
                                                                        class="nested-input"
                                                                        @change="updateNestedArrayItem(entry.keyPath, entry.value, index, nestedIdx, ($event.target as HTMLInputElement).value)" />
                                                                    <input v-else-if="typeof nestedItem === 'number'"
                                                                        type="number" :value="nestedItem"
                                                                        class="nested-input"
                                                                        @change="updateNestedArrayItem(entry.keyPath, entry.value, index, nestedIdx, parseFloat(($event.target as HTMLInputElement).value))" />
                                                                    <button v-else-if="typeof nestedItem === 'boolean'"
                                                                        :class="['bool-toggle', 'small', { 'active': nestedItem }]"
                                                                        @click="updateNestedArrayItem(entry.keyPath, entry.value, index, nestedIdx, !nestedItem)">
                                                                        <div class="toggle-track">
                                                                            <div class="toggle-thumb" />
                                                                        </div>
                                                                    </button>
                                                                    <span v-else class="nested-complex">{{
                                                                        JSON.stringify(nestedItem) }}</span>
                                                                </div>
                                                            </template>
                                                            <template v-else>
                                                                <!-- Object Properties -->
                                                                <div v-for="(propValue, propKey) in item"
                                                                    :key="String(propKey)" class="object-prop">
                                                                    <span class="prop-key">{{ propKey }}</span>
                                                                    <input v-if="typeof propValue === 'string'"
                                                                        type="text" :value="propValue"
                                                                        class="prop-input"
                                                                        @change="updateObjectProperty(entry.keyPath, entry.value, index, String(propKey), ($event.target as HTMLInputElement).value)" />
                                                                    <input v-else-if="typeof propValue === 'number'"
                                                                        type="number" :value="propValue"
                                                                        class="prop-input"
                                                                        @change="updateObjectProperty(entry.keyPath, entry.value, index, String(propKey), parseFloat(($event.target as HTMLInputElement).value))" />
                                                                    <button v-else-if="typeof propValue === 'boolean'"
                                                                        :class="['bool-toggle', 'small', { 'active': propValue }]"
                                                                        @click="updateObjectProperty(entry.keyPath, entry.value, index, String(propKey), !propValue)">
                                                                        <div class="toggle-track">
                                                                            <div class="toggle-thumb" />
                                                                        </div>
                                                                    </button>
                                                                    <template v-else-if="Array.isArray(propValue)">
                                                                        <!-- Array property -->
                                                                        <div class="prop-array">
                                                                            <button class="prop-array-toggle"
                                                                                @click="toggleExpanded(`${entry.keyPath}[${index}].${propKey}`)">
                                                                                <svg :class="['expand-icon-sm', { 'rotated': expandedPaths.has(`${entry.keyPath}[${index}].${propKey}`) }]"
                                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                                    viewBox="0 0 24 24" fill="none"
                                                                                    stroke="currentColor"
                                                                                    stroke-width="2">
                                                                                    <polyline points="9 18 15 12 9 6" />
                                                                                </svg>
                                                                                <span class="prop-array-count">{{
                                                                                    propValue.length }} items</span>
                                                                            </button>
                                                                            <div v-if="expandedPaths.has(`${entry.keyPath}[${index}].${propKey}`)"
                                                                                class="prop-array-items">
                                                                                <div v-for="(arrItem, arrIdx) in propValue"
                                                                                    :key="arrIdx"
                                                                                    class="prop-array-item">
                                                                                    <span class="prop-array-idx">#{{
                                                                                        arrIdx + 1 }}</span>
                                                                                    <input
                                                                                        v-if="typeof arrItem === 'string'"
                                                                                        type="text" :value="arrItem"
                                                                                        class="prop-array-input"
                                                                                        @change="updateObjectArrayProperty(entry.keyPath, entry.value, index, String(propKey), arrIdx, ($event.target as HTMLInputElement).value)" />
                                                                                    <span v-else
                                                                                        class="prop-array-complex">{{
                                                                                            typeof arrItem === 'object' ?
                                                                                                JSON.stringify(arrItem) :
                                                                                                arrItem }}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </template>
                                                                    <span v-else class="prop-complex">{{
                                                                        JSON.stringify(propValue) }}</span>
                                                                </div>
                                                            </template>
                                                        </div>
                                                    </div>

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

        <!-- Changes Summary (Compact floating bar) -->
        <Transition name="slide-up">
            <div v-if="hasChanges && editorMode === 'visual'" class="changes-bar">
                <div class="changes-bar-content">
                    <div class="changes-info">
                        <div class="changes-badge">{{ modificationCount }}</div>
                        <span class="changes-text">unsaved change{{ modificationCount !== 1 ? 's' : '' }}</span>
                    </div>
                    <div class="changes-actions">
                        <button class="changes-btn-discard" @click="discardChanges">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2" class="w-4 h-4">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                            </svg>
                            Discard
                        </button>
                        <button class="changes-btn-save" :disabled="saving" @click="saveChanges">
                            <svg v-if="saving" class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg"
                                fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                    stroke-width="4" />
                                <path class="opacity-75" fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2" class="w-4 h-4">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            {{ saving ? 'Saving...' : 'Save Changes' }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive, nextTick } from 'vue';
import { createLogger } from '@/utils/logger';
import type { ConfigEntry, ConfigSection, ParsedConfig } from '@/types';

const log = createLogger('ConfigStructuredEditor');

interface GroupedSection {
    name: string;
    displayName: string;
    entries: ConfigEntry[];
}

const props = defineProps<{
    instanceId: string;
    configPath: string;
    refreshKey?: number;  // Change this value to force reload
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

// Detailed modifications with line numbers for display
interface ModificationDetail {
    keyPath: string;
    key: string;
    oldValue: any;
    newValue: any;
    line?: number;
    section?: string;
}

const modificationDetails = computed((): ModificationDetail[] => {
    const details: ModificationDetail[] = [];
    for (const [keyPath, newValue] of Object.entries(editedValues)) {
        const entry = parsedConfig.value?.allEntries.find(e => e.keyPath === keyPath);
        details.push({
            keyPath,
            key: entry?.key || keyPath.split('.').pop() || keyPath,
            oldValue: entry?.originalValue,
            newValue,
            line: entry?.line,
            section: entry?.section
        });
    }
    // Sort by line number if available
    details.sort((a, b) => (a.line || 0) - (b.line || 0));
    return details;
});

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
        log.error('Failed to load structured config', { instanceId: props.instanceId, configPath: props.configPath, error: String(err) });
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

// Object in array helpers
const getObjectPreview = (item: any): string => {
    if (Array.isArray(item)) {
        return `[${item.length} items]`;
    }
    const keys = Object.keys(item);
    if (keys.length <= 2) {
        return keys.map(k => `${k}: ${typeof item[k] === 'string' ? `"${item[k]}"` : item[k]}`).join(', ');
    }
    return `{ ${keys.slice(0, 2).join(', ')}... }`;
};

const updateObjectProperty = (keyPath: string, originalValue: any, arrayIndex: number, propKey: string, propValue: any) => {
    const currentArray = [...getEditValue(keyPath, originalValue)];
    const currentObj = { ...currentArray[arrayIndex] };
    currentObj[propKey] = propValue;
    currentArray[arrayIndex] = currentObj;
    setEditedValue(keyPath, currentArray, originalValue);
};

const updateNestedArrayItem = (keyPath: string, originalValue: any, arrayIndex: number, nestedIndex: number, newValue: any) => {
    const currentArray = [...getEditValue(keyPath, originalValue)];
    const nestedArray = [...currentArray[arrayIndex]];
    nestedArray[nestedIndex] = newValue;
    currentArray[arrayIndex] = nestedArray;
    setEditedValue(keyPath, currentArray, originalValue);
};

const updateObjectArrayProperty = (keyPath: string, originalValue: any, arrayIndex: number, propKey: string, arrIdx: number, newValue: any) => {
    const currentArray = [...getEditValue(keyPath, originalValue)];
    const currentObj = { ...currentArray[arrayIndex] };
    const propArray = [...currentObj[propKey]];
    propArray[arrIdx] = newValue;
    currentObj[propKey] = propArray;
    currentArray[arrayIndex] = currentObj;
    setEditedValue(keyPath, currentArray, originalValue);
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
            // Build modifications list with line numbers
            const modifications = Object.entries(editedValues).map(([keyPath, newValue]) => {
                // Here I'm trying to find original entry
                const entry = parsedConfig.value?.allEntries.find(e => e.keyPath === keyPath);

                return {
                    key: keyPath,
                    oldValue: entry?.originalValue ?? entry?.value,
                    newValue,
                    section: entry?.section,
                    line: entry?.line
                };
            });

            log.debug('Saving modifications', {
                instanceId: props.instanceId,
                configPath: props.configPath,
                modificationCount: modifications.length
            });

            await window.api.configs.saveStructured(props.instanceId, props.configPath, modifications);

            log.debug('Save successful, reloading');

            // Reset of the edited values and reload config
            Object.keys(editedValues).forEach(key => delete editedValues[key]);
            await loadConfig();
        }

        emit('saved');
    } catch (err: any) {
        error.value = err.message || 'Errore nel salvataggio';
        log.error('Failed to save structured config', { instanceId: props.instanceId, configPath: props.configPath, error: String(err) });
    } finally {
        saving.value = false;
    }
};

const saveRawContent = async () => {
    try {
        await window.api.configs.write(props.instanceId, props.configPath, rawContent.value);
        originalRawContent.value = rawContent.value;
        log.debug('Raw save successful', { configPath: props.configPath });
        // Reload to get updated parsed config
        await loadConfig();
    } catch (err: any) {
        error.value = err.message || 'Errore nel salvataggio';
        log.error('Failed to save raw config', { instanceId: props.instanceId, configPath: props.configPath, error: String(err) });
        throw err;
    }
};

// Watch for prop changes
watch(() => [props.instanceId, props.configPath, props.refreshKey], () => {
    Object.keys(editedValues).forEach(key => delete editedValues[key]);
    loadConfig();
});

// Load on mount
onMounted(() => {
    loadConfig();
});

// Expose methods for parent components
defineExpose({
    reload: loadConfig
});
</script>

<style scoped>
.structured-editor {
    @apply flex flex-col h-full bg-background overflow-hidden;
}

/* Header */
.editor-header {
    @apply flex items-center justify-between p-4 border-b border-border bg-card/50 shrink-0;
}

.header-left {
    @apply flex items-center gap-3;
}

.file-icon {
    @apply w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20;
}

.file-icon svg {
    @apply w-5 h-5 text-primary;
}

.file-info {
    @apply flex flex-col;
}

.file-name {
    @apply font-medium text-foreground;
}

.file-format {
    @apply text-xs text-muted-foreground font-mono px-1.5 py-0.5 bg-muted rounded;
}

.header-actions {
    @apply flex items-center gap-3;
}

.header-divider {
    @apply w-px h-6 bg-border;
}

/* Mode Toggle */
.mode-toggle {
    @apply flex items-center bg-muted/50 rounded-xl p-1;
}

.mode-btn {
    @apply flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground text-sm font-medium transition-all;
}

.mode-btn:hover {
    @apply text-foreground;
}

.mode-btn.active {
    @apply bg-background text-foreground shadow-sm ring-1 ring-border/50;
}

.mode-btn svg {
    @apply w-4 h-4;
}

.btn-discard {
    @apply flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all text-sm;
}

.btn-save {
    @apply flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-muted-foreground transition-all text-sm;
}

.btn-save.has-changes {
    @apply bg-primary text-primary-foreground hover:bg-primary/90;
}

.btn-save:disabled {
    @apply opacity-50 cursor-not-allowed;
}

/* Search Bar */
.search-bar {
    @apply relative flex items-center p-3 border-b border-border/50 shrink-0;
}

.search-icon {
    @apply absolute left-6 w-4 h-4 text-muted-foreground;
}

.search-input {
    @apply flex-1 bg-muted/50 rounded-xl py-2.5 pl-10 pr-4 text-foreground placeholder-muted-foreground text-sm border border-transparent focus:border-primary/50 focus:outline-none transition-colors;
}

.search-count {
    @apply absolute right-6 text-xs text-muted-foreground;
}

/* Loading & Error States */
.loading-state,
.error-state {
    @apply flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground;
}

.loading-spinner {
    @apply w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin;
}

.error-icon {
    @apply w-12 h-12 text-destructive;
}

.error-actions {
    @apply flex items-center gap-2;
}

.btn-retry {
    @apply px-4 py-2 bg-muted hover:bg-muted/80 rounded-xl text-sm transition-colors;
}

.btn-raw-fallback {
    @apply px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-sm transition-colors;
}

/* Visual Content */
.visual-content {
    @apply flex-1 overflow-y-auto p-4 space-y-3 pb-24;
}

/* Config Section */
.config-section {
    @apply bg-card rounded-xl border border-border overflow-hidden;
}

.section-header {
    @apply w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors;
}

.section-chevron {
    @apply w-4 h-4 text-muted-foreground transition-transform shrink-0;
}

.section-chevron.rotated {
    @apply rotate-90;
}

.section-name {
    @apply flex-1 font-medium text-foreground;
}

.section-count {
    @apply text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full;
}

.section-content {
    @apply p-3 pt-0 space-y-2;
}

/* Config Card */
.config-card {
    @apply bg-muted/30 rounded-xl p-3 border border-transparent transition-all hover:border-border;
}

.config-card.modified {
    @apply border-primary/50 bg-primary/5;
}

.card-header {
    @apply flex items-center justify-between mb-2;
}

.card-key {
    @apply flex items-center gap-2;
}

.key-name {
    @apply font-mono text-sm text-foreground;
}

.key-type {
    @apply text-[10px] px-1.5 py-0.5 rounded font-medium uppercase;
}

.type-string {
    @apply bg-green-500/10 text-green-500;
}

.type-number {
    @apply bg-blue-500/10 text-blue-500;
}

.type-boolean {
    @apply bg-yellow-500/10 text-yellow-500;
}

.type-array {
    @apply bg-purple-500/10 text-purple-500;
}

.type-object {
    @apply bg-orange-500/10 text-orange-500;
}

.type-null {
    @apply bg-muted text-muted-foreground;
}

.card-value {
    @apply flex items-start;
}

.card-comment {
    @apply flex items-start gap-1.5 mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground italic;
}

.comment-icon {
    @apply w-3 h-3 shrink-0 mt-0.5;
}

/* Value Inputs */
.value-input {
    @apply bg-background rounded-lg px-3 py-2 text-foreground text-sm border border-border focus:border-primary focus:outline-none transition-colors font-mono;
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
    @apply w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent;
}

.color-text-input {
    @apply flex-1 bg-background rounded-lg px-3 py-2 text-foreground text-sm border border-border focus:border-primary focus:outline-none transition-colors font-mono;
}

/* Boolean Toggle */
.bool-toggle {
    @apply flex items-center gap-3 cursor-pointer;
}

.toggle-track {
    @apply w-12 h-6 rounded-full bg-muted relative transition-colors;
}

.bool-toggle.active .toggle-track {
    @apply bg-primary;
}

.toggle-thumb {
    @apply absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform;
}

.bool-toggle.active .toggle-thumb {
    @apply translate-x-6;
}

.bool-toggle span {
    @apply text-sm text-muted-foreground;
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
    @apply flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors;
}

.array-count {
    @apply text-primary font-mono text-xs;
}

.array-items-card {
    @apply mt-3 space-y-1 bg-muted/30 rounded-xl p-2 border border-border/50;
}

.array-item {
    @apply flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors;
}

.array-index {
    @apply text-xs font-mono text-muted-foreground w-6 shrink-0;
}

.array-item-input {
    @apply flex-1 bg-background rounded-lg px-2 py-1.5 text-sm font-mono text-foreground border border-border focus:border-primary focus:outline-none transition-colors;
}

.complex-item {
    @apply flex-1 text-xs font-mono text-muted-foreground truncate;
}

/* Array Object Item (complex items in array) */
.array-object-item {
    @apply flex-1 flex flex-col;
}

.object-item-toggle {
    @apply flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer;
}

.object-item-type {
    @apply text-[10px] px-1.5 py-0.5 rounded font-medium uppercase bg-orange-500/10 text-orange-500;
}

.object-item-preview {
    @apply text-xs font-mono text-muted-foreground truncate max-w-[200px];
}

.object-item-content {
    @apply mt-2 ml-4 pl-3 border-l-2 border-border/50 space-y-1;
}

/* Object properties */
.object-prop {
    @apply flex items-center gap-2 py-1;
}

.prop-key {
    @apply text-xs font-mono text-primary min-w-[80px] shrink-0;
}

.prop-input {
    @apply flex-1 bg-background rounded-lg px-2 py-1 text-xs font-mono text-foreground border border-border focus:border-primary focus:outline-none transition-colors;
}

.prop-complex {
    @apply text-xs font-mono text-muted-foreground truncate;
}

/* Nested items */
.nested-item {
    @apply flex items-center gap-2 py-1;
}

.nested-index {
    @apply text-xs font-mono text-muted-foreground min-w-[30px] shrink-0;
}

.nested-input {
    @apply flex-1 bg-background rounded-lg px-2 py-1 text-xs font-mono text-foreground border border-border focus:border-primary focus:outline-none transition-colors;
}

.nested-complex {
    @apply text-xs font-mono text-muted-foreground truncate;
}

/* Property array (array inside object) */
.prop-array {
    @apply flex-1 flex flex-col;
}

.prop-array-toggle {
    @apply flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer;
}

.expand-icon-sm {
    @apply w-3 h-3 transition-transform shrink-0;
}

.expand-icon-sm.rotated {
    @apply rotate-90;
}

.prop-array-count {
    @apply text-purple-400 font-mono;
}

.prop-array-items {
    @apply mt-1 ml-2 space-y-0.5;
}

.prop-array-item {
    @apply flex items-center gap-2 py-0.5;
}

.prop-array-idx {
    @apply text-[10px] font-mono text-muted-foreground w-5 shrink-0;
}

.prop-array-input {
    @apply flex-1 bg-background rounded px-1.5 py-0.5 text-xs font-mono text-foreground border border-border focus:border-primary focus:outline-none transition-colors;
}

.prop-array-complex {
    @apply text-xs font-mono text-muted-foreground truncate;
}

.array-remove-btn {
    @apply p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0;
}

.array-remove-btn svg {
    @apply w-4 h-4;
}

.array-empty {
    @apply text-center py-3 text-sm text-muted-foreground italic;
}

.array-add-row {
    @apply flex items-center gap-2 mt-2 pt-2 border-t border-border/50;
}

.array-add-input {
    @apply flex-1 bg-background rounded-lg px-2 py-1.5 text-sm font-mono text-foreground placeholder-muted-foreground border border-border focus:border-primary focus:outline-none transition-colors;
}

.array-add-btn {
    @apply flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors;
}

.array-add-btn svg {
    @apply w-4 h-4;
}

/* Object Preview */
.object-preview {
    @apply flex-1;
}

.object-toggle {
    @apply flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors;
}

.object-count {
    @apply text-orange-500 font-mono text-xs;
}

.expand-icon {
    @apply w-4 h-4 transition-transform shrink-0;
}

.expand-icon.rotated {
    @apply rotate-90;
}

.json-preview {
    @apply mt-2 p-3 bg-muted/50 rounded-xl text-xs text-muted-foreground font-mono overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all border border-border/50;
}

.null-value {
    @apply text-sm font-mono text-muted-foreground italic;
}

/* Reset Button */
.reset-btn {
    @apply p-1.5 rounded-lg hover:bg-orange-500/10 text-muted-foreground hover:text-orange-500 transition-colors shrink-0;
}

.reset-btn svg {
    @apply w-4 h-4;
}

/* Empty State */
.empty-state {
    @apply flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground;
}

.empty-icon {
    @apply w-16 h-16 text-muted-foreground/20;
}

/* Raw Editor */
.raw-editor-container {
    @apply flex-1 flex flex-col overflow-hidden;
}

.raw-toolbar {
    @apply flex items-center justify-between px-4 py-2 border-b border-border/50 bg-muted/30;
}

.raw-hint {
    @apply flex items-center gap-2 text-xs text-muted-foreground;
}

.raw-encoding {
    @apply text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded;
}

.raw-textarea {
    @apply flex-1 w-full p-4 bg-transparent text-foreground font-mono text-sm resize-none focus:outline-none;
    line-height: 1.6;
}

/* Changes Bar (Compact floating) */
.changes-bar {
    @apply fixed bottom-6 left-1/2 -translate-x-1/2 z-50;
}

.changes-bar-content {
    @apply flex items-center gap-4 px-4 py-3 rounded-2xl bg-card/95 backdrop-blur-xl border border-border shadow-2xl shadow-black/20;
}

.changes-info {
    @apply flex items-center gap-2;
}

.changes-badge {
    @apply w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center;
}

.changes-text {
    @apply text-sm font-medium text-foreground;
}

.changes-actions {
    @apply flex items-center gap-2;
}

.changes-btn-discard {
    @apply flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors;
}

.changes-btn-save {
    @apply flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50;
}

/* Slide-up transition */
.slide-up-enter-active,
.slide-up-leave-active {
    transition: all 0.2s ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
}
</style>
