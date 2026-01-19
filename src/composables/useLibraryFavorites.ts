import { ref } from "vue";

const FAVORITES_KEY = "modex:favorites:mods";

/**
 * Composable for managing library favorites.
 * Handles persistence to localStorage and triggers storage events for sidebar updates.
 */
export function useLibraryFavorites() {
  const favoriteMods = ref<Set<string>>(new Set());

  function loadFavorites(): void {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) {
        favoriteMods.value = new Set(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load favorites from localStorage:", e);
      favoriteMods.value = new Set();
    }
  }

  function saveFavorites(): void {
    localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify([...favoriteMods.value])
    );
    // Trigger storage event for sidebar update
    window.dispatchEvent(new Event("storage"));
  }

  function toggleFavorite(modId: string): void {
    if (favoriteMods.value.has(modId)) {
      favoriteMods.value.delete(modId);
    } else {
      favoriteMods.value.add(modId);
    }
    saveFavorites();
  }

  function isFavorite(modId: string): boolean {
    return favoriteMods.value.has(modId);
  }

  return {
    favoriteMods,
    loadFavorites,
    saveFavorites,
    toggleFavorite,
    isFavorite,
  };
}
