# LibraryView.vue Refactoring Plan

> **Created:** January 8, 2026  
> **Status:** ✅ Phase 1 & 2 Complete  
> **Original File:** `src/views/LibraryView.vue` (2136 lines)  
> **Current File:** `src/views/LibraryView.vue` (1577 lines) - **26% reduction**

## Progress Summary

### ✅ Phase 1: Composables (COMPLETE)
| Composable | Lines | Purpose |
|------------|-------|---------|
| `useLibraryFavorites.ts` | ~40 | Favorites persistence with localStorage |
| `useLibrarySettings.ts` | ~100 | Settings persistence with auto-save |
| `useLibrarySelection.ts` | ~70 | Selection management with compatibility checking |
| `useLibraryFiltering.ts` | ~400 | Search, filter, sort, and grouping logic |
| `useLibraryPagination.ts` | ~80 | Generic pagination with filter-change reset |

### ✅ Phase 2: Simple Components (COMPLETE)
| Component | Purpose |
|-----------|---------|
| `LibraryDragOverlay.vue` | Drag & drop overlay UI |
| `LibraryEmptyState.vue` | Empty library state with CTA |
| `LibraryPaginationControls.vue` | Pagination navigation UI |
| `LibraryResultsInfo.vue` | Results count and clear filters |

---

## STEP 1 – DEPENDENCY MAPPING

### 1.1 Imports

| Category | Items |
|----------|-------|
| **Vue Core** | `ref`, `onMounted`, `computed`, `watch`, `nextTick`, `shallowRef` |
| **VueUse** | `refDebounced` |
| **Vue Router** | `useRoute`, `useRouter` |
| **Composables** | `useKeyboardShortcuts`, `useFolderTree`, `useToast` |
| **Types** | `Mod`, `Modpack`, `ModUsageInfo` |
| **Components** | `ModCard`, `GalleryCard`, `Button`, `Input`, `Dialog`, `ProgressDialog`, `CreateModpackDialog`, `AddToModpackDialog`, `BulkActionBar`, `UpdatesDialog`, `ModUpdateDialog`, `ConfirmDialog`, `ModDetailsModal` |
| **Icons (25)** | `Search`, `FolderPlus`, `FilePlus`, `Trash2`, `PackagePlus`, `PlusCircle`, `LayoutGrid`, `List`, `LayoutList`, `Info`, `X`, `Heart`, `AlertTriangle`, `HardDrive`, `Folder`, `FolderInput`, `ArrowUpCircle`, `Globe`, `Layers`, `ChevronDown`, `ChevronRight`, `Image`, `Sparkles`, `Filter`, `Settings2`, `Columns`, `GalleryVertical`, `Package` |

### 1.2 Refs (State Variables) – 45 Total

| Group | Refs | Used In |
|-------|------|---------|
| **Core Data** | `mods`, `modpacks`, `modUsageMap` | Filtering, rendering, actions |
| **Loading/Error** | `isLoading`, `error` | Loading states |
| **Search/Filter** | `searchQuery`, `searchQueryDebounced`, `selectedLoader`, `selectedGameVersion`, `selectedContentType`, `modpackFilter`, `searchField`, `quickFilter`, `selectedFolderId` | Filtering logic |
| **UI State** | `showFilters`, `showColumnSelector`, `viewMode`, `showThumbnails`, `enableGrouping`, `expandedGroups` | View rendering |
| **Pagination** | `currentPage`, `itemsPerPage`, `isFiltering` | Pagination controls |
| **Sorting** | `sortBy`, `sortDir` | Sorting logic |
| **Selection** | `selectedModIds` | Bulk actions |
| **Details Panel** | `showDetails`, `detailsMod` | Modal display |
| **Dialog States** | `showDeleteDialog`, `showBulkDeleteDialog`, `showCreateModpackDialog`, `showAddToModpackDialog`, `showMoveToFolderDialog`, `showUpdatesDialog`, `showSingleModUpdateDialog`, `modToDelete`, `selectedUpdateMod` | Dialog visibility |
| **Usage Warning** | `showUsageWarningDialog`, `modUsageInfo`, `pendingDeleteModIds` | Delete with usage check |
| **Progress** | `showProgress`, `progressTitle`, `progressMessage` | Progress display |
| **Favorites** | `favoriteMods` | Favorites system |
| **Duplicates** | `duplicates` | Duplicate detection |
| **Drag/Drop** | `isDragging`, `dragCounter` | Drag & drop overlay |
| **Columns** | `visibleColumns` | List view columns |
| **URL Actions** | `pendingModAction` | Deep linking |

### 1.3 Computed Properties – 16 Total

| Computed | Dependencies | Purpose |
|----------|--------------|---------|
| `loaderStats` | `mods` | Count mods per loader |
| `loaders` | `loaderStats` | Unique loader list |
| `contentTypeCounts` | `mods` | Count by content type |
| `gameVersions` | `mods` | Unique game versions |
| `selectedModsCompatibility` | `selectedModIds`, `mods` | Check selection compatibility |
| `activeFilterCount` | Multiple filters | Badge count |
| `filteredMods` | `mods`, all filters, `searchQueryDebounced`, `favoriteMods`, `sortBy`, `sortDir` | Main filtering logic |
| `groupedMods` | `filteredMods`, `enableGrouping`, `expandedGroups` | Grouping logic |
| `totalPages` | `groupedMods`, `itemsPerPage` | Pagination calc |
| `paginatedGroups` | `groupedMods`, `currentPage`, `itemsPerPage` | Current page items |
| `canGoPrev` | `currentPage` | Pagination nav |
| `canGoNext` | `currentPage`, `totalPages` | Pagination nav |
| `displayMods` | `enableGrouping`, `groupedMods` | Flat mod list |
| `duplicateCount` | `duplicates` | Duplicate badge |
| `duplicateModIds` | `duplicates` | Set of duplicate IDs |
| `installedProjectFiles` | `mods` | CF project/file map |

### 1.4 Watchers – 6 Total

| Watch Target | Effect | Cascade Impact |
|--------------|--------|----------------|
| Filter refs array (7 items) | Reset `currentPage` to 1 | Pagination |
| Settings refs array (13 items) | Call `saveSettings()` | LocalStorage persistence |
| `route.query.filter` | Set `quickFilter` | URL sync |
| `route.query.action` | Navigate to search | URL action handling |
| `route.query.mod` | Handle mod action | Deep linking |
| `mods.value.length` | Process pending mod action | Deep linking init |

### 1.5 Functions – 38 Total

| Category | Functions |
|----------|-----------|
| **Data Loading** | `loadMods`, `loadUsageDataDeferred` |
| **Search/Filter** | `matchesSearchQuery`, `clearAllFilters` |
| **Grouping** | `toggleGroup`, `getGroupInfo` |
| **Selection** | `toggleSelection`, `clearSelection`, `selectAll`, `selectNone` |
| **Details** | `showModDetails`, `closeDetails`, `handleLibraryVersionChange` |
| **Favorites** | `loadFavorites`, `saveFavorites`, `toggleFavorite`, `isFavorite` |
| **Settings** | `saveSettings`, `loadSettings` |
| **Duplicates** | `detectDuplicates`, `isDuplicate` |
| **Sorting** | `toggleSort` |
| **Pagination** | `goToPage`, `prevPage`, `nextPage` |
| **Folders** | `moveSelectedToFolder` |
| **Delete** | `confirmDelete`, `deleteMod`, `confirmBulkDelete`, `deleteSelectedMods`, `deleteModsWithCleanup`, `cancelUsageWarning` |
| **Modpack** | `createModpackFromSelection`, `addSelectionToModpack` |
| **Updates** | `openUpdateDialog`, `handleModUpdated` |
| **Drag/Drop** | `handleDragEnter`, `handleDragOver`, `handleDragLeave`, `handleDrop` |
| **URL Actions** | `handleModAction` |
| **Helpers** | `isElectron`, `setContentType`, `handleImageError` |

### 1.6 API Calls (Electron IPC)

| API Call | Used In |
|----------|---------|
| `window.api.mods.getAll()` | `loadMods` |
| `window.api.modpacks.getAll()` | `loadMods` |
| `window.api.mods.checkUsage()` | `loadUsageDataDeferred`, `confirmDelete`, `confirmBulkDelete` |
| `window.api.mods.delete()` | `deleteMod` |
| `window.api.mods.bulkDelete()` | `deleteSelectedMods` |
| `window.api.mods.deleteWithModpackCleanup()` | `deleteModsWithCleanup` |
| `window.api.modpacks.create()` | `createModpackFromSelection` |
| `window.api.modpacks.addModsBatch()` | `createModpackFromSelection`, `addSelectionToModpack` |
| `window.api.updates.applyUpdate()` | `handleLibraryVersionChange` |

### 1.7 Side Effects

| Side Effect | Location |
|-------------|----------|
| `localStorage.getItem/setItem` | Favorites, Settings |
| `window.dispatchEvent(new Event('storage'))` | `saveFavorites` |
| `router.push/replace` | Multiple navigation actions |
| `toast.success/error/info` | User feedback |

---

## STEP 2 – RISK CLASSIFICATION

### Proposed Extraction Blocks

| Block | Coupling Level | Regression Risk | Cascade Impact Area |
|-------|----------------|-----------------|---------------------|
| **LibraryHeader** (header section) | MEDIUM | LOW | Quick filters, search, view mode toggles |
| **LibraryFilters** (filter sidebar) | MEDIUM | MEDIUM | All filter refs, computed `activeFilterCount` |
| **LibraryPagination** (pagination controls) | LOW | LOW | Pagination refs, navigation functions |
| **LibraryGridView** (grid rendering) | LOW | LOW | `paginatedGroups`, selection, events |
| **LibraryGalleryView** (gallery rendering) | LOW | LOW | `paginatedGroups`, selection, events |
| **LibraryListView** (list/table rendering) | MEDIUM | LOW | `paginatedGroups`, `visibleColumns`, events |
| **LibraryCompactView** (compact rendering) | LOW | LOW | `paginatedGroups`, selection, events |
| **LibraryDialogs** (all dialogs) | HIGH | HIGH | Many dialog states, delete/create functions |
| **LibraryEmptyState** (empty state) | LOW | LOW | Just router navigation |
| **LibraryDragOverlay** (drag overlay) | LOW | LOW | `isDragging` only |
| **useLibraryFiltering** (composable) | HIGH | HIGH | All filter/sort/pagination logic |
| **useLibrarySelection** (composable) | MEDIUM | MEDIUM | Selection logic, compatibility check |
| **useLibrarySettings** (composable) | LOW | LOW | Settings persistence only |
| **useLibraryFavorites** (composable) | LOW | LOW | Favorites persistence only |

---

## STEP 3 – EXTRACTION PLAN

### 3.1 Composables (Business Logic)

#### `useLibraryFavorites.ts`
**Responsibilities:**
- Favorites persistence to localStorage
- Toggle, check, load, save

**Input/Output Contract:**
```typescript
interface UseLibraryFavoritesReturn {
  favoriteMods: Ref<Set<string>>
  loadFavorites: () => void
  saveFavorites: () => void
  toggleFavorite: (modId: string) => void
  isFavorite: (modId: string) => boolean
}
```

---

#### `useLibrarySettings.ts`
**Responsibilities:**
- Load/save settings from localStorage
- Watch settings changes for auto-save

**Input/Output Contract:**
```typescript
interface LibrarySettings {
  viewMode: 'grid' | 'gallery' | 'list' | 'compact'
  sortBy: 'name' | 'loader' | 'created_at' | 'version'
  sortDir: 'asc' | 'desc'
  showThumbnails: boolean
  selectedLoader: string
  selectedGameVersion: string
  searchField: 'all' | 'name' | 'author' | 'version' | 'description'
  modpackFilter: string
  selectedContentType: 'all' | 'mod' | 'resourcepack' | 'shader'
  visibleColumns: string[]
  showFilters: boolean
  itemsPerPage: number
  enableGrouping: boolean
}

interface UseLibrarySettingsReturn {
  settings: LibrarySettings (reactive refs)
  loadSettings: () => void
  saveSettings: () => void
}
```

---

#### `useLibrarySelection.ts`
**Responsibilities:**
- Selection state (`selectedModIds`)
- Selection functions
- Compatibility computation

**Input/Output Contract:**
```typescript
interface UseLibrarySelectionOptions {
  mods: Ref<Mod[]>
  filteredMods: ComputedRef<Mod[]>
}

interface UseLibrarySelectionReturn {
  selectedModIds: Ref<Set<string>>
  selectedModsCompatibility: ComputedRef<{
    compatible: boolean
    gameVersion: string | null
    loader: string | null
  }>
  toggleSelection: (id: string) => void
  clearSelection: () => void
  selectAll: () => void
  selectNone: () => void
}
```

---

#### `useLibraryFiltering.ts`
**Responsibilities:**
- Search query management (debounced)
- Filter state (loader, version, contentType, modpackFilter, searchField, quickFilter, folderId)
- Computed: `activeFilterCount`, `filteredMods`, `groupedMods`
- Function: `matchesSearchQuery`, `clearAllFilters`

**Input/Output Contract:**
```typescript
interface UseLibraryFilteringOptions {
  mods: Ref<Mod[]>
  modUsageMap: Ref<Map<string, Set<string>>>
  favoriteMods: Ref<Set<string>>
  getModFolder: (modId: string) => string | null
}

interface UseLibraryFilteringReturn {
  // State
  searchQuery: Ref<string>
  selectedLoader: Ref<string>
  selectedGameVersion: Ref<string>
  selectedContentType: Ref<'all' | 'mod' | 'resourcepack' | 'shader'>
  modpackFilter: Ref<string>
  searchField: Ref<'all' | 'name' | 'author' | 'version' | 'description'>
  quickFilter: Ref<'all' | 'favorites' | 'recent'>
  selectedFolderId: Ref<string | null>
  sortBy: Ref<'name' | 'loader' | 'created_at' | 'version'>
  sortDir: Ref<'asc' | 'desc'>
  enableGrouping: Ref<boolean>
  expandedGroups: Ref<Set<string>>
  
  // Computed
  activeFilterCount: ComputedRef<number>
  filteredMods: ComputedRef<Mod[]>
  groupedMods: ComputedRef<ModGroup[]>
  loaders: ComputedRef<string[]>
  gameVersions: ComputedRef<string[]>
  contentTypeCounts: ComputedRef<{ mod: number; resourcepack: number; shader: number }>
  
  // Methods
  clearAllFilters: () => void
  toggleGroup: (groupKey: string) => void
  toggleSort: (field: 'name' | 'loader' | 'created_at' | 'version') => void
}
```

---

#### `useLibraryPagination.ts`
**Responsibilities:**
- Pagination state
- Page navigation functions
- Watch for filter changes to reset page

**Input/Output Contract:**
```typescript
interface UseLibraryPaginationOptions {
  items: ComputedRef<any[]>
  filterDeps: WatchSource[]
}

interface UseLibraryPaginationReturn {
  currentPage: Ref<number>
  itemsPerPage: Ref<number>
  itemsPerPageOptions: readonly number[]
  totalPages: ComputedRef<number>
  paginatedItems: ComputedRef<any[]>
  canGoPrev: ComputedRef<boolean>
  canGoNext: ComputedRef<boolean>
  goToPage: (page: number) => void
  prevPage: () => void
  nextPage: () => void
}
```

---

### 3.2 Components (UI)

#### `LibraryHeader.vue`
**Props:**
- `modCount`, `quickFilter`, `searchQuery`, `searchField`, `showFilters`, `activeFilterCount`
- `viewMode`, `showColumnSelector`, `enableGrouping`, `visibleColumns`, `availableColumns`

**Emits:**
- `update:quickFilter`, `update:searchQuery`, `update:showFilters`, `update:viewMode`
- `update:showColumnSelector`, `update:enableGrouping`, `toggle-column`
- `navigate-search`, `show-updates`

---

#### `LibraryFilters.vue`
**Props:**
- `show`, `selectedContentType`, `selectedGameVersion`, `selectedLoader`
- `modpackFilter`, `sortBy`, `sortDir`, `gameVersions`, `loaders`, `modpacks`, `activeFilterCount`

**Emits:**
- `close`, `update:selectedContentType`, `update:selectedGameVersion`, `update:selectedLoader`
- `update:modpackFilter`, `update:sortBy`, `update:sortDir`, `clear-all`

---

#### `LibraryPaginationControls.vue`
**Props:** `currentPage`, `totalPages`, `itemsPerPage`, `itemsPerPageOptions`, `canGoPrev`, `canGoNext`
**Emits:** `update:currentPage`, `update:itemsPerPage`, `prev`, `next`, `first`, `last`

---

#### `LibraryResultsInfo.vue`
**Props:** `enableGrouping`, `paginatedCount`, `totalGroupCount`, `totalModCount`, `hasVariants`, `hasActiveFilters`
**Emits:** `clear-filters`

---

#### `LibraryEmptyState.vue`
**Emits:** `browse`

---

#### `LibraryDragOverlay.vue`
**Props:** `visible`

---

### 3.3 Extraction Hierarchy

```
LibraryView.vue
├── Composables (extract first - no UI changes)
│   ├── useLibraryFavorites.ts
│   ├── useLibrarySettings.ts
│   ├── useLibrarySelection.ts
│   ├── useLibraryFiltering.ts
│   └── useLibraryPagination.ts
│
├── Simple Components (extract second - minimal coupling)
│   ├── LibraryDragOverlay.vue
│   ├── LibraryEmptyState.vue
│   └── LibraryPaginationControls.vue
│
├── Medium Components (extract third)
│   ├── LibraryResultsInfo.vue
│   ├── LibraryFilters.vue
│   └── LibraryHeader.vue
│
└── View Components remain inline (high coupling to parent state)
    ├── Grid View template section
    ├── Gallery View template section
    ├── List View template section
    ├── Compact View template section
    └── All Dialogs (keep inline - too many state dependencies)
```

---

## STEP 4 – SAFE REFACTOR RULES

### 4.1 Behavior Preservation Rules

| Rule | Enforcement |
|------|-------------|
| No logic changes | Extracted code must be identical in behavior |
| No new abstractions | Don't introduce new patterns not present |
| No optional parameter defaults | Keep all defaults as-is |
| No type widening/narrowing | Types must be equivalent |

### 4.2 Naming Mapping Table

| Original | Extracted To | Location |
|----------|--------------|----------|
| `searchQuery` | `searchQuery` (ref) | `useLibraryFiltering` |
| `filteredMods` | `filteredMods` (computed) | `useLibraryFiltering` |
| `selectedModIds` | `selectedModIds` (ref) | `useLibrarySelection` |
| `favoriteMods` | `favoriteMods` (ref) | `useLibraryFavorites` |
| `loadFavorites` | `loadFavorites` (fn) | `useLibraryFavorites` |

### 4.3 Reactive Chain Preservation

| Chain | Verification |
|-------|--------------|
| `searchQuery` → `searchQueryDebounced` → `filteredMods` | Keep debounce inside composable |
| `filteredMods` → `groupedMods` → `paginatedGroups` | All must stay in same composable or have explicit dependencies |
| Filter changes → `currentPage = 1` | Watch must be preserved exactly |
| Settings changes → `saveSettings()` | Watch must be preserved exactly |

### 4.4 Event Flow Preservation

All existing events must be forwarded through component hierarchy without modification:
- `@delete`, `@toggle-select`, `@show-details`, `@toggle-favorite`, `@request-update`, `@toggle-group`

---

## STEP 5 – VALIDATION STRATEGY

### 5.1 Before/After Dependency Graph

**Before (Monolithic):**
```
LibraryView.vue
└── 45 refs, 16 computed, 38 functions, 6 watches
    └── All tightly coupled in single file
```

**After (Modular):**
```
LibraryView.vue
├── useLibraryFavorites
│   └── favoriteMods, loadFavorites, saveFavorites, toggleFavorite, isFavorite
├── useLibrarySettings
│   └── saveSettings, loadSettings + settings watch
├── useLibrarySelection
│   └── selectedModIds, compatibility, selection functions
├── useLibraryFiltering
│   └── All filter/sort refs, filteredMods, groupedMods, filter functions
├── useLibraryPagination
│   └── pagination refs, paginatedGroups, navigation functions
├── LibraryHeader.vue
│   └── Header UI only
├── LibraryFilters.vue
│   └── Filter panel UI only
├── LibraryPaginationControls.vue
│   └── Pagination UI only
├── LibraryResultsInfo.vue
│   └── Results text UI only
├── LibraryEmptyState.vue
│   └── Empty state UI only
└── LibraryDragOverlay.vue
    └── Drag overlay UI only
```

### 5.2 Regression Prevention Checklist

| Check | Method |
|-------|--------|
| ✅ All refs still reactive | Compare ref count before/after |
| ✅ All computed still trigger | Test filter changes |
| ✅ All watches still fire | Test URL param changes, settings changes |
| ✅ All events still emit | Click test all buttons |
| ✅ LocalStorage still works | Check favorites/settings persistence |
| ✅ API calls still execute | Test load, delete, create modpack |
| ✅ Router navigation works | Test all navigation paths |
| ✅ Keyboard shortcuts work | Test Ctrl+F, Ctrl+A, Escape, Delete, 1/2/3 |
| ✅ Drag/drop handlers fire | Test drag overlay visibility |
| ✅ Deep linking works | Test `?mod=xxx` and `?filter=favorites` |

### 5.3 Refactor Execution Order

1. **Phase 1: Composables** (no UI changes, testable in isolation)
   1. Extract `useLibraryFavorites` ← Lowest risk, self-contained
   2. Extract `useLibrarySettings` ← Low risk, only localStorage
   3. Extract `useLibrarySelection` ← Medium risk, compatibility computed
   4. Extract `useLibraryFiltering` ← High value, complex logic
   5. Extract `useLibraryPagination` ← Low risk, simple logic

2. **Phase 2: Simple Components** (minimal props/emits)
   1. Extract `LibraryDragOverlay` ← Single prop
   2. Extract `LibraryEmptyState` ← Single emit
   3. Extract `LibraryPaginationControls` ← Simple props/emits

3. **Phase 3: Complex Components** (many props/emits)
   1. Extract `LibraryResultsInfo`
   2. Extract `LibraryFilters`
   3. Extract `LibraryHeader`

4. **Phase 4: Do NOT extract** (too high coupling, diminishing returns)
   - View mode templates (Grid/Gallery/List/Compact)
   - Dialog components (already external, just instantiated here)

### 5.4 Manual Verification Steps

For each extraction:

1. **Before extraction:** Note current behavior
2. **After extraction:** Verify:
   - [ ] Component renders identically
   - [ ] Click handlers work
   - [ ] Reactive updates propagate
   - [ ] No console errors/warnings
   - [ ] TypeScript compiles without errors

---

## EXECUTION PROGRESS

### Phase 1: Composables

- [ ] 1.1 `useLibraryFavorites.ts`
- [ ] 1.2 `useLibrarySettings.ts`  
- [ ] 1.3 `useLibrarySelection.ts`
- [ ] 1.4 `useLibraryFiltering.ts`
- [ ] 1.5 `useLibraryPagination.ts`
- [ ] 1.6 Update LibraryView.vue to use composables

### Phase 2: Simple Components

- [ ] 2.1 `LibraryDragOverlay.vue`
- [ ] 2.2 `LibraryEmptyState.vue`
- [ ] 2.3 `LibraryPaginationControls.vue`
- [ ] 2.4 Update LibraryView.vue to use components

### Phase 3: Complex Components

- [ ] 3.1 `LibraryResultsInfo.vue`
- [ ] 3.2 `LibraryFilters.vue`
- [ ] 3.3 `LibraryHeader.vue`
- [ ] 3.4 Update LibraryView.vue to use components

### Final Validation

- [ ] Full regression test
- [ ] TypeScript compilation clean
- [ ] No console warnings
- [ ] All features working

---

## SUMMARY

| Metric | Before | After (Target) |
|--------|--------|----------------|
| Lines in LibraryView.vue | 2136 | ~1200 |
| Composables | 0 | 5 |
| Extracted Components | 0 | 6 |
| Refs in main file | 45 | ~20 |
| Functions in main file | 38 | ~15 |
| Reusability | Low | High |
| Testability | Low | High |
