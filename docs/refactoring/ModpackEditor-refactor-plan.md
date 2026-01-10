# ModpackEditor.vue Refactoring Plan

> **Created:** January 9, 2026  
> **Updated:** January 9, 2026  
> **Status:** Phase 1 Complete - Composables Created  
> **Original File:** `src/components/modpacks/ModpackEditor.vue` (6090 lines)

---

## PHASE 1 STATUS: COMPLETE ✅

All domain-specific composables have been created and are ready for integration:

| Composable | File | Purpose | Lines |
|------------|------|---------|-------|
| `useModpackCompatibility` | `src/composables/useModpackCompatibility.ts` | Mod compatibility checking | ~160 |
| `useModpackFiltering` | `src/composables/useModpackFiltering.ts` | Search, filter, sort mods | ~150 |
| `useModpackSelection` | `src/composables/useModpackSelection.ts` | Mod selection state | ~150 |
| `useModpackMods` | `src/composables/useModpackMods.ts` | Mod CRUD operations | ~320 |
| `useModpackUpdates` | `src/composables/useModpackUpdates.ts` | Update checking & applying | ~330 |
| `useModpackInstance` | `src/composables/useModpackInstance.ts` | Instance lifecycle | ~480 |
| `useModpackGameLogs` | `src/composables/useModpackGameLogs.ts` | Game log streaming | ~180 |
| `useModpackConfigSync` | `src/composables/useModpackConfigSync.ts` | Config import/export | ~230 |

**Total composable code: ~2000 lines** of reusable, testable logic.

---

## PHASE 2: INTEGRATION (Next Steps)

### Integration Strategy

The composables are designed as drop-in replacements. Integration should follow this order:

1. **Add composable imports** (DONE - imports added to ModpackEditor.vue)
2. **Initialize composables** after core refs are defined
3. **Replace inline state** with composable state (one domain at a time)
4. **Replace inline functions** with composable functions
5. **Remove duplicate code** after each domain migration
6. **Validate** each domain works correctly before proceeding

### Recommended Integration Order

1. `useModpackCompatibility` - Lowest risk, pure computed logic
2. `useModpackFiltering` - Search/filter, minimal side effects
3. `useModpackSelection` - Selection state, simple refs
4. `useModpackGameLogs` - Isolated domain, easy to verify
5. `useModpackConfigSync` - Config sync, isolated functions
6. `useModpackUpdates` - More complex, has API calls
7. `useModpackMods` - Core CRUD, most critical
8. `useModpackInstance` - Instance lifecycle, most interconnected

---

## STEP 1 – DEPENDENCY MAPPING

### 1.1 Imports

| Category | Items |
|----------|-------|
| **Vue Core** | `ref`, `computed`, `watch`, `onMounted`, `onUnmounted` |
| **Composables** | `useToast`, `useInstances` |
| **Types** | `Mod`, `Modpack`, `ModpackChange`, `RemoteUpdateResult`, `ModexInstance`, `InstanceSyncResult`, `ConfigFile`, `CFModLoader` |
| **Components (15)** | `Button`, `Dialog`, `ConfirmDialog`, `ProgressDialog`, `ModUpdateDialog`, `FilePickerDialog`, `VersionHistoryPanel`, `ModpackAnalysisPanel`, `RecommendationsPanel`, `UpdateReviewDialog`, `ConfigBrowser`, `ConfigStructuredEditor`, `UpdateAvailableBanner`, `CurseForgeSearch`, `ModDetailsModal`, `ChangelogDialog` |
| **Icons (60+)** | `X`, `Plus`, `Trash2`, `Search`, `Download`, `Check`, `ImagePlus`, `ArrowUpCircle`, `ArrowLeft`, `Lock`, `LockOpen`, `Save`, `GitBranch`, `Package`, `Settings`, `Layers`, `AlertCircle`, `AlertTriangle`, `RefreshCw`, `Share2`, `Globe`, `ToggleLeft`, `ToggleRight`, `Filter`, `CheckSquare`, `Square`, `Image`, `Sparkles`, `History`, `ExternalLink`, `Info`, `HelpCircle`, `ChevronDown`, `BookOpen`, `Lightbulb`, `Play`, `Loader2`, `FolderOpen`, `FileCode`, `Clock`, `HardDrive`, `Gamepad2`, `Terminal`, `ChevronUp`, `Cpu`, `MemoryStick`, `Sliders`, `Rocket`, `FileWarning`, `FolderSync`, `FileEdit`, `FolderTree`, `FileText`, `MessageSquare`, `MessageSquarePlus`, `MoreHorizontal`, `Stethoscope` |

### 1.2 Props & Emits

```typescript
// Props
modpackId: string
isOpen: boolean
initialTab?: "play" | "mods" | "discover" | "health" | "versions" | "settings" | "remote" | "configs"
fullScreen?: boolean

// Emits
"close", "update", "export", "updated", "launched"
```

### 1.3 State Variables (Refs) – 100+ Total

| Domain | Refs | Count |
|--------|------|-------|
| **Core Data** | `modpack`, `currentMods`, `availableMods`, `disabledModIds`, `lockedModIds`, `modNotes` | 6 |
| **Loading/Error** | `isLoading`, `loadError`, `isSaving` | 3 |
| **Search/Filter** | `searchQueryInstalled`, `searchQueryAvailable`, `sortBy`, `sortDir`, `modsFilter`, `contentTypeTab` | 6 |
| **Selection** | `selectedModIds` | 1 |
| **Tab Navigation** | `activeTab`, `showMoreMenu`, `showModsFilterMenu`, `showHelp` | 4 |
| **Mod Updates** | `showSingleModUpdateDialog`, `selectedUpdateMod`, `showVersionPickerDialog`, `versionPickerMod`, `checkingUpdates`, `updateAvailable`, `isCheckingAllUpdates`, `recentlyUpdatedMods`, `recentlyAddedMods` | 9 |
| **Mod Details** | `showModDetailsModal`, `modDetailsTarget` | 2 |
| **Changelog** | `showChangelogDialog`, `changelogMod` | 2 |
| **Mod Notes** | `showModNoteDialog`, `noteDialogMod`, `noteDialogText`, `isSavingNote` | 4 |
| **Instance/Play** | `instance`, `instanceStats`, `isInstanceLoading`, `isCreatingInstance`, `isSyncingInstance`, `isLaunching`, `syncResult`, `instanceSyncStatus`, `showSyncDetails`, `selectedSyncMode`, `syncSettings`, `loaderProgress`, `gameLaunched`, `gameLoadingMessage`, `linkedInstanceId` | 15 |
| **Instance Settings** | `showInstanceSettings`, `showDeleteInstanceDialog`, `isDeletingInstance`, `memoryMin`, `memoryMax`, `customJavaArgs`, `systemMemory` | 7 |
| **Game Logs** | `gameLogs`, `showLogConsole`, `logScrollRef`, `logLevelFilter` | 4 |
| **Version History** | `versionUnsavedCount` | 1 |
| **Config Editor** | `showStructuredEditor`, `structuredEditorFile`, `configRefreshKey`, `modifiedConfigs`, `showModifiedConfigsDetails`, `selectedConfigsForImport`, `isImportingConfigs`, `showOnlyModifiedConfigs` | 8 |
| **Sync Confirmation** | `showSyncConfirmDialog`, `pendingLaunchData`, `clearExistingMods` | 3 |
| **Dependency Impact** | `showDependencyImpactDialog`, `dependencyImpact`, `pendingModAction`, `showBulkDependencyImpactDialog`, `bulkDependencyImpact`, `pendingBulkModIds` | 6 |
| **Remove Incompatible** | `showRemoveIncompatibleDialog` | 1 |
| **Remote Updates** | `showReviewDialog`, `updateResult`, `isCheckingUpdate`, `showProgressDialog`, `progressState` | 5 |
| **CurseForge Updates** | `cfUpdateInfo`, `isCheckingCFUpdate`, `showCFChangelog`, `cfChangelog`, `isLoadingChangelog`, `showCFUpdateDialog`, `isApplyingCFUpdate`, `cfUpdateProgress` | 8 |
| **Re-search** | `isReSearching`, `reSearchProgress` | 2 |
| **Edit Form** | `editForm` (name, description, version, minecraft_version, loader, loader_version, remote_url, auto_check_remote) | 1 |
| **Dynamic Options** | `fetchedGameVersions`, `isLoadingGameVersions`, `fetchedLoaderTypes`, `isLoadingLoaderTypes`, `availableLoaderVersions`, `isLoadingLoaderVersions` | 6 |
| **CurseForge Search** | `showCFSearch`, `isLibraryCollapsed` | 2 |

### 1.4 Computed Properties – 25+ Total

| Computed | Dependencies | Purpose |
|----------|--------------|---------|
| `isSecondaryTab` | `activeTab` | Check if current tab is in secondary menu |
| `maxAllowedRam` | `systemMemory` | Calculate max RAM based on system |
| `filteredGameLogs` | `gameLogs`, `logLevelFilter` | Filter logs by level |
| `logLevelCounts` | `gameLogs` | Count logs by level |
| `runningGame` | `instance`, `runningGames` | Get running game for this instance |
| `isGameRunning` | `runningGame` | Check if game is running |
| `importableConfigs` | `modifiedConfigs`, `showOnlyModifiedConfigs` | Filterable config list |
| `deletedConfigs` | `modifiedConfigs` | Configs deleted from instance |
| `newConfigsCount` | `modifiedConfigs` | Count of new configs |
| `isExistingModpack` | `modpack` | Check if modpack exists |
| `isLinked` | `modpack` | Check if linked to remote |
| `filteredInstalledMods` | `currentMods`, `contentTypeTab`, `searchQueryInstalled`, `modsFilter`, `disabledModIds`, `lockedModIds`, `updateAvailable`, `recentlyUpdatedMods`, `recentlyAddedMods`, `modNotes`, `sortBy`, `sortDir` | Main filtered mods list |
| `contentTypeCounts` | `currentMods` | Count mods/resourcepacks/shaders |
| `installedModsWithCompatibility` | `filteredInstalledMods` | Mods with compatibility check |
| `incompatibleModCount` | `currentMods`, `contentTypeTab` | Count incompatible mods |
| `warningModCount` | `currentMods`, `contentTypeTab` | Count warning mods |
| `installedProjectFiles` | `currentMods` | Map of installed CF project files |
| `availableGameVersions` | `fetchedGameVersions`, `editForm.minecraft_version` | Combined game versions |
| `loaders` | `fetchedLoaderTypes` | Available loaders |
| `filteredLoaderVersions` | `availableLoaderVersions`, `editForm.loader` | Filtered loader versions |

### 1.5 Functions – 93 Total

| Domain | Functions | Count |
|--------|-----------|-------|
| **Data Loading** | `loadData`, `loadInstance`, `loadSystemInfo`, `loadSyncSettings`, `loadModifiedConfigs`, `refreshSyncStatus`, `refreshAndNotify`, `refreshUnsavedChangesCount` | 8 |
| **Mod Updates** | `checkModUpdate`, `updateMod`, `checkAllUpdates`, `quickUpdateMod`, `updateAllMods`, `openSingleModUpdate`, `handleSingleModUpdated` | 7 |
| **Version Picker** | `openVersionPicker`, `handleVersionSelected` | 2 |
| **Mod Details** | `openModDetails`, `closeModDetails`, `handleModDetailsVersionChange` | 3 |
| **Changelog** | `viewModChangelog` | 1 |
| **Instance Management** | `handleCreateInstance`, `handleSyncInstance`, `handleLaunch`, `handleSyncConfirmation`, `handleKillGame`, `handleOpenInstanceFolder`, `openInstanceSettings`, `saveInstanceSettings`, `handleDeleteInstance` | 9 |
| **Sync Settings** | `toggleAutoSync`, `toggleSyncConfirmation` | 2 |
| **Config Management** | `handleOpenStructuredEditor`, `handleCloseStructuredEditor`, `toggleConfigSelection`, `selectAllConfigs`, `deselectAllConfigs`, `importSelectedConfigs`, `formatFileSize`, `formatPlayDate` | 8 |
| **Modpack Info** | `saveModpackInfo`, `selectImage`, `sanitizeRemoteUrl` | 3 |
| **Mod CRUD** | `addMod`, `removeMod`, `executeModRemoval`, `toggleModEnabled`, `executeModToggle`, `toggleModLocked` | 6 |
| **Mod Notes** | `openModNoteDialog`, `saveModNote`, `closeModNoteDialog`, `getModNote` | 4 |
| **Bulk Selection** | `toggleSelect`, `selectAll`, `selectAllEnabled`, `selectHalfEnabled`, `selectAllDisabled`, `selectHalfDisabled`, `clearSelection` | 7 |
| **Bulk Actions** | `removeSelectedMods`, `executeBulkRemove`, `bulkEnableSelected`, `bulkDisableSelected`, `executeBulkDisable`, `bulkLockSelected`, `bulkUnlockSelected` | 7 |
| **Incompatible Handling** | `removeIncompatibleMods`, `confirmRemoveIncompatibleMods`, `reSearchIncompatibleMods` | 3 |
| **Dependency Impact** | `confirmDependencyImpactAction`, `cancelDependencyImpactAction`, `confirmDependencyImpactWithDependents`, `confirmBulkDependencyImpactAction`, `confirmBulkDependencyWithDependents`, `cancelBulkDependencyImpactAction` | 6 |
| **Sorting** | `toggleSort` | 1 |
| **Analysis Integration** | `handleAddModFromAnalysis` | 1 |
| **Export** | `exportManifest`, `exportResourceList` | 2 |
| **Remote Updates** | `checkForRemoteUpdates`, `applyRemoteUpdate` | 2 |
| **CurseForge Updates** | `checkForCFUpdate`, `viewCFChangelog`, `openCFUpdateDialog`, `applyCFUpdate` | 4 |
| **CurseForge Search** | `handleCFSearchClose`, `handleCFModAdded` | 2 |
| **Compatibility** | `isModCompatible` | 1 |
| **Loader Versions** | `extractLoaderVersion`, `fetchLoaderVersions`, `fetchMinecraftVersions`, `fetchLoaderTypes` | 4 |

### 1.6 Watchers – 4 Total

| Watch | Purpose |
|-------|---------|
| `editForm.minecraft_version + editForm.loader` | Fetch loader versions when MC version or loader changes |
| `contentTypeTab` | Clear selection when tab changes |
| `props.isOpen` | Load data when dialog opens, reset on close |
| `props.modpackId + props.initialTab` | Load data when modpack changes |

### 1.7 Lifecycle Hooks

| Hook | Purpose |
|------|---------|
| `onMounted` | Fetch MC versions/loader types, setup game log listener |
| `onUnmounted` | Cleanup game log listener |

---

## STEP 2 – RISK CLASSIFICATION

### 2.1 Domain Coupling Analysis

| Domain | Coupling | Risk | Cascade Impact |
|--------|----------|------|----------------|
| **Instance/Play** | HIGH | HIGH | Game launch, sync, logs, settings |
| **Mod Management** | HIGH | HIGH | Selection, CRUD, compatibility, updates |
| **Config Editor** | MEDIUM | MEDIUM | Config browser, structured editor, import |
| **Remote Updates** | MEDIUM | MEDIUM | CF updates, remote manifest updates |
| **Version History** | LOW | LOW | Mostly delegated to VersionHistoryPanel |
| **Settings Form** | LOW | LOW | Isolated form state |
| **Selection System** | MEDIUM | HIGH | Used by bulk actions, remove, enable/disable |
| **Dependency Analysis** | MEDIUM | HIGH | Remove/disable operations cascade |

### 2.2 High-Risk Extractions

1. **Instance/Play Tab** - Complex lifecycle with game process management
2. **Mod List + Bulk Actions** - Selection state shared across operations
3. **Compatibility Checking** - Used throughout filtering and display
4. **Dependency Impact Dialogs** - Complex confirmation flows

### 2.3 Safe Extractions

1. **Help Guide Content** - Pure UI, no logic
2. **Header Section** - Props-based display
3. **Tab Navigation** - Simple state
4. **Empty States** - Pure UI
5. **Settings Form** - Isolated form

---

## STEP 3 – EXTRACTION PLAN

### Phase 1: Composables (Logic Extraction)

| Composable | Responsibilities | Inputs | Outputs |
|------------|-----------------|--------|---------|
| `useModpackMods` | Mod CRUD, toggle, lock, notes | modpackId, currentMods | add/remove/toggle functions, modNotes |
| `useModpackSelection` | Selection state, bulk select helpers | mods list | selectedModIds, toggle/select/clear functions |
| `useModpackFiltering` | Filter/sort installed mods | mods, filters, sortBy | filteredMods, sortedMods |
| `useModpackCompatibility` | Check mod compatibility | modpack, mod | isModCompatible, stats |
| `useModpackUpdates` | Check/apply mod updates | currentMods, modpackId | checkAll, updateMod, updateAvailable |
| `useModpackInstance` | Instance lifecycle | modpackId | instance, sync, launch, kill |
| `useModpackGameLogs` | Game log management | instanceId | logs, filter, counts |
| `useModpackConfigs` | Config sync/import | modpackId, instanceId | modifiedConfigs, import functions |
| `useModpackRemote` | Remote updates | modpackId | check, apply, updateResult |
| `useModpackSettings` | Edit form + save | modpackId | editForm, save, validation |
| `useLoaderVersions` | Fetch MC/loader versions | - | versions, loaders, fetch functions |

### Phase 2: Simple Components (UI Extraction)

| Component | Responsibilities |
|-----------|------------------|
| `ModpackEditorHeader.vue` | Title, stats, version badge, actions |
| `ModpackEditorTabs.vue` | Tab navigation with More dropdown |
| `ModpackEditorHelpGuide.vue` | Collapsible help content per tab |
| `ModpackModCard.vue` | Single mod row with actions (reuse from mods list) |
| `ModpackModsToolbar.vue` | Search, filter, sort, bulk actions |
| `ModpackEmptyState.vue` | Empty states for each tab |
| `ModpackInstanceStatus.vue` | Instance sync status display |
| `ModpackGameConsole.vue` | Game log console with filters |
| `ModpackSettingsForm.vue` | Modpack info edit form |
| `ModpackRemoteStatus.vue` | Remote update status and actions |

### Phase 3: Complex Components (Tab Panels)

| Component | Responsibilities |
|-----------|------------------|
| `ModpackPlayTab.vue` | Instance creation, sync, launch, settings |
| `ModpackModsTab.vue` | Mod list, filtering, bulk actions |
| `ModpackConfigsTab.vue` | Config browser + editor integration |
| `ModpackDiscoverTab.vue` | CurseForge search integration |
| `ModpackSettingsTab.vue` | Modpack info form |
| `ModpackRemoteTab.vue` | Remote sync settings and updates |

---

## STEP 4 – SAFE REFACTOR RULES

### 4.1 Behavioral Preservation

- [ ] All API calls preserved with same error handling
- [ ] All toast notifications maintained
- [ ] All emit events fired at same points
- [ ] All watch triggers preserved
- [ ] All computed dependencies unchanged

### 4.2 Naming Conventions

| Original | Composable/Component |
|----------|---------------------|
| `selectedModIds` | `useModpackSelection.selectedModIds` |
| `toggleSelect` | `useModpackSelection.toggleSelect` |
| `filteredInstalledMods` | `useModpackFiltering.filteredMods` |
| `isModCompatible` | `useModpackCompatibility.checkCompatibility` |
| `instance` | `useModpackInstance.instance` |
| `handleLaunch` | `useModpackInstance.launch` |

### 4.3 State Flow Preservation

```
modpackId (prop)
    ↓
loadData() → modpack, currentMods
    ↓
useModpackFiltering ← currentMods, filters
    ↓
filteredInstalledMods → template rendering
    ↓
useModpackSelection ← filteredMods
    ↓
bulk actions → API calls → emit('update')
```

### 4.4 Reactive Chain Rules

- Never break: `modpack` → `isModCompatible` → `filteredInstalledMods`
- Never break: `selectedModIds` → bulk action functions
- Never break: `instance` → `runningGame` → `isGameRunning`
- Never break: `editForm` → validation → save

---

## STEP 5 – VALIDATION STRATEGY

### 5.1 Refactor Execution Order

1. **Create composables** (no template changes yet)
   - `useModpackCompatibility`
   - `useModpackFiltering`
   - `useModpackSelection`
   - `useModpackMods`
   - `useModpackUpdates`
   - `useModpackInstance`
   - `useModpackGameLogs`
   - `useModpackConfigs`
   - `useLoaderVersions`

2. **Integrate composables into ModpackEditor.vue**
   - Replace inline logic with composable calls
   - Verify TypeScript compilation
   - Test each domain

3. **Extract simple components**
   - Header, Tabs, Help Guide
   - Replace template sections

4. **Extract tab components**
   - One tab at a time
   - Full integration testing between extractions

### 5.2 Regression Prevention Checklist

- [ ] All mod CRUD operations work (add, remove, enable, disable, lock)
- [ ] Mod notes can be added/edited/deleted
- [ ] Bulk selection and actions work
- [ ] Compatibility filtering works
- [ ] Update checking and applying works
- [ ] Instance create/sync/launch works
- [ ] Game logs display correctly
- [ ] Config browser and editor work
- [ ] Remote updates work
- [ ] CF updates work
- [ ] Export functions work
- [ ] All dialogs open/close correctly
- [ ] Tab navigation works
- [ ] Search and filters work
- [ ] Sorting works

### 5.3 Before/After Dependency Graph

**Before:**
```
ModpackEditor.vue (6090 lines)
├── 100+ refs
├── 25+ computed
├── 93 functions
├── 4 watchers
└── 2 lifecycle hooks
```

**After (Target):**
```
ModpackEditor.vue (~1500 lines)
├── Core orchestration
├── Tab routing
└── Dialog management

composables/
├── useModpackCompatibility.ts (~80 lines)
├── useModpackFiltering.ts (~120 lines)
├── useModpackSelection.ts (~100 lines)
├── useModpackMods.ts (~200 lines)
├── useModpackUpdates.ts (~150 lines)
├── useModpackInstance.ts (~300 lines)
├── useModpackGameLogs.ts (~80 lines)
├── useModpackConfigs.ts (~150 lines)
└── useLoaderVersions.ts (~100 lines)

components/modpacks/
├── ModpackEditorHeader.vue (~100 lines)
├── ModpackEditorTabs.vue (~80 lines)
├── ModpackEditorHelpGuide.vue (~200 lines)
├── ModpackPlayTab.vue (~400 lines)
├── ModpackModsTab.vue (~500 lines)
├── ModpackModsToolbar.vue (~150 lines)
├── ModpackConfigsTab.vue (~200 lines)
├── ModpackSettingsTab.vue (~200 lines)
└── ModpackRemoteTab.vue (~200 lines)
```

### 5.4 Verification Steps

1. **TypeScript Check**: `npx vue-tsc --noEmit`
2. **Manual Testing**:
   - Open modpack editor
   - Navigate all tabs
   - Test mod operations
   - Test instance launch
   - Test config editing
3. **Build Verification**: `npm run build`

---

## CONSTRAINTS COMPLIANCE

- ✅ No speculative cleanup
- ✅ No logic optimization
- ✅ No code path removal
- ✅ No stylistic-only changes
- ✅ Deterministic, side-effect-safe refactoring
