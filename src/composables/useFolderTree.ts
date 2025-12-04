import { ref, computed, watch } from "vue";
import type { Mod, ModFolder, TreeNode } from "@/types/electron";

const STORAGE_KEY = "modex:folders";
const MOD_FOLDER_MAP_KEY = "modex:mod-folder-map";

// Shared state
const folders = ref<ModFolder[]>([]);
const modFolderMap = ref<Map<string, string>>(new Map()); // modId -> folderId

// Load from localStorage
function loadFromStorage() {
  try {
    const savedFolders = localStorage.getItem(STORAGE_KEY);
    if (savedFolders) {
      folders.value = JSON.parse(savedFolders);
    }
    
    const savedMap = localStorage.getItem(MOD_FOLDER_MAP_KEY);
    if (savedMap) {
      modFolderMap.value = new Map(JSON.parse(savedMap));
    }
  } catch (e) {
    console.error("Failed to load folder data:", e);
  }
}

// Save to localStorage
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(folders.value));
    localStorage.setItem(MOD_FOLDER_MAP_KEY, JSON.stringify(Array.from(modFolderMap.value.entries())));
  } catch (e) {
    console.error("Failed to save folder data:", e);
  }
}

// Initialize
loadFromStorage();

export function useFolderTree() {
  // Create a new folder
  function createFolder(name: string, parentId: string | null = null, color?: string): ModFolder {
    const folder: ModFolder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      parentId,
      color: color || getRandomColor(),
      expanded: true,
      order: folders.value.filter(f => f.parentId === parentId).length,
      created_at: new Date().toISOString(),
    };
    folders.value.push(folder);
    saveToStorage();
    return folder;
  }

  // Update folder
  function updateFolder(id: string, updates: Partial<ModFolder>): boolean {
    const index = folders.value.findIndex(f => f.id === id);
    if (index === -1) return false;
    folders.value[index] = { ...folders.value[index], ...updates };
    saveToStorage();
    return true;
  }

  // Delete folder (and optionally move children to parent)
  function deleteFolder(id: string, moveChildrenToParent = true): boolean {
    const folder = folders.value.find(f => f.id === id);
    if (!folder) return false;

    if (moveChildrenToParent) {
      // Move child folders to parent
      folders.value.forEach(f => {
        if (f.parentId === id) {
          f.parentId = folder.parentId;
        }
      });
      
      // Move mods to parent folder (or root)
      modFolderMap.value.forEach((folderId, modId) => {
        if (folderId === id) {
          if (folder.parentId) {
            modFolderMap.value.set(modId, folder.parentId);
          } else {
            modFolderMap.value.delete(modId);
          }
        }
      });
    } else {
      // Delete all children recursively
      const childIds = getDescendantFolderIds(id);
      folders.value = folders.value.filter(f => !childIds.includes(f.id) && f.id !== id);
      
      // Remove mods from deleted folders
      modFolderMap.value.forEach((folderId, modId) => {
        if (childIds.includes(folderId) || folderId === id) {
          modFolderMap.value.delete(modId);
        }
      });
    }

    folders.value = folders.value.filter(f => f.id !== id);
    saveToStorage();
    return true;
  }

  // Get all descendant folder IDs
  function getDescendantFolderIds(folderId: string): string[] {
    const children = folders.value.filter(f => f.parentId === folderId);
    const ids = children.map(c => c.id);
    children.forEach(c => {
      ids.push(...getDescendantFolderIds(c.id));
    });
    return ids;
  }

  // Move mod to folder
  function moveModToFolder(modId: string, folderId: string | null): void {
    if (folderId === null) {
      modFolderMap.value.delete(modId);
    } else {
      modFolderMap.value.set(modId, folderId);
    }
    saveToStorage();
  }

  // Move multiple mods to folder
  function moveModsToFolder(modIds: string[], folderId: string | null): void {
    modIds.forEach(modId => {
      if (folderId === null) {
        modFolderMap.value.delete(modId);
      } else {
        modFolderMap.value.set(modId, folderId);
      }
    });
    saveToStorage();
  }

  // Get folder for a mod
  function getModFolder(modId: string): string | null {
    return modFolderMap.value.get(modId) || null;
  }

  // Move folder to new parent
  function moveFolderTo(folderId: string, newParentId: string | null): boolean {
    // Prevent moving folder into itself or its descendants
    if (folderId === newParentId) return false;
    if (newParentId && getDescendantFolderIds(folderId).includes(newParentId)) return false;

    const folder = folders.value.find(f => f.id === folderId);
    if (!folder) return false;

    folder.parentId = newParentId;
    saveToStorage();
    return true;
  }

  // Toggle folder expanded state
  function toggleFolderExpanded(folderId: string): void {
    const folder = folders.value.find(f => f.id === folderId);
    if (folder) {
      folder.expanded = !folder.expanded;
      saveToStorage();
    }
  }

  // Build tree structure from flat folders and mods
  function buildTree(mods: Mod[]): TreeNode[] {
    const tree: TreeNode[] = [];
    
    // Create folder nodes
    const folderNodes = new Map<string, TreeNode>();
    
    // Sort folders by order
    const sortedFolders = [...folders.value].sort((a, b) => a.order - b.order);
    
    sortedFolders.forEach(folder => {
      const node: TreeNode = {
        id: folder.id,
        type: 'folder',
        name: folder.name,
        parentId: folder.parentId,
        children: [],
        data: folder,
        expanded: folder.expanded ?? true,
        order: folder.order,
      };
      folderNodes.set(folder.id, node);
    });

    // Build folder hierarchy
    folderNodes.forEach(node => {
      if (node.parentId && folderNodes.has(node.parentId)) {
        folderNodes.get(node.parentId)!.children!.push(node);
      } else if (!node.parentId) {
        tree.push(node);
      }
    });

    // Add mods to their folders or root
    const modsWithoutFolder: TreeNode[] = [];
    
    mods.forEach((mod, index) => {
      const modNode: TreeNode = {
        id: mod.id,
        type: 'mod',
        name: mod.name,
        parentId: getModFolder(mod.id),
        data: mod,
        order: index,
      };

      const folderId = getModFolder(mod.id);
      if (folderId && folderNodes.has(folderId)) {
        folderNodes.get(folderId)!.children!.push(modNode);
      } else {
        modsWithoutFolder.push(modNode);
      }
    });

    // Sort children in each folder
    folderNodes.forEach(node => {
      if (node.children) {
        node.children.sort((a, b) => {
          // Folders first, then mods
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.order - b.order;
        });
      }
    });

    // Add unorganized mods at the end
    tree.push(...modsWithoutFolder);
    
    // Sort root level
    tree.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.order - b.order;
    });

    return tree;
  }

  // Get mods in a specific folder
  function getModsInFolder(folderId: string | null): string[] {
    if (folderId === null) {
      // Return mods not in any folder
      const modsInFolders = new Set(modFolderMap.value.keys());
      return [];
    }
    
    const modIds: string[] = [];
    modFolderMap.value.forEach((folder, modId) => {
      if (folder === folderId) {
        modIds.push(modId);
      }
    });
    return modIds;
  }

  // Get folder by ID
  function getFolderById(id: string): ModFolder | undefined {
    return folders.value.find(f => f.id === id);
  }

  // Get child folders
  function getChildFolders(parentId: string | null): ModFolder[] {
    return folders.value.filter(f => f.parentId === parentId).sort((a, b) => a.order - b.order);
  }

  // Get folder path (breadcrumb)
  function getFolderPath(folderId: string): ModFolder[] {
    const path: ModFolder[] = [];
    let current = folders.value.find(f => f.id === folderId);
    
    while (current) {
      path.unshift(current);
      current = current.parentId ? folders.value.find(f => f.id === current!.parentId) : undefined;
    }
    
    return path;
  }

  // Reorder folders
  function reorderFolder(folderId: string, newOrder: number, parentId: string | null): void {
    const siblings = folders.value.filter(f => f.parentId === parentId);
    const folder = folders.value.find(f => f.id === folderId);
    if (!folder) return;

    // Update order for all siblings
    siblings
      .filter(f => f.id !== folderId)
      .sort((a, b) => a.order - b.order)
      .forEach((f, i) => {
        f.order = i >= newOrder ? i + 1 : i;
      });
    
    folder.order = newOrder;
    folder.parentId = parentId;
    saveToStorage();
  }

  // Stats
  const folderCount = computed(() => folders.value.length);
  const organizedModCount = computed(() => modFolderMap.value.size);

  return {
    folders,
    modFolderMap,
    folderCount,
    organizedModCount,
    createFolder,
    updateFolder,
    deleteFolder,
    moveModToFolder,
    moveModsToFolder,
    getModFolder,
    moveFolderTo,
    toggleFolderExpanded,
    buildTree,
    getModsInFolder,
    getFolderById,
    getChildFolders,
    getFolderPath,
    reorderFolder,
    loadFromStorage,
    saveToStorage,
  };
}

// Helper function to get random color for folders
function getRandomColor(): string {
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
