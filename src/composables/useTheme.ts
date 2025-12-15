import { ref, watch } from "vue";

export type Theme =
  | "dark"
  | "light"
  | "forest"
  | "ocean"
  | "sunset"
  | "cyberpunk";

const currentTheme = ref<Theme>("dark");

export function useTheme() {
  function setTheme(theme: Theme) {
    currentTheme.value = theme;
    // Apply to document
    document.documentElement.setAttribute("data-theme", theme);
    // Persist
    localStorage.setItem("modex-theme", theme);
  }

  function toggleTheme() {
    setTheme(currentTheme.value === "dark" ? "light" : "dark");
  }

  function initializeTheme() {
    const saved = localStorage.getItem("modex-theme") as Theme;
    if (saved) {
      setTheme(saved);
    } else {
      // Default to dark
      setTheme("dark");
    }
  }

  return {
    currentTheme,
    setTheme,
    toggleTheme,
    initializeTheme,
    themes: [
      { id: "dark", name: "Midnight (Default)", color: "bg-zinc-950" },
      { id: "light", name: "Daylight", color: "bg-white" },
      { id: "forest", name: "Forest", color: "bg-emerald-950" },
      { id: "ocean", name: "Ocean", color: "bg-blue-950" },
      { id: "sunset", name: "Sunset", color: "bg-orange-950" },
      { id: "cyberpunk", name: "Cyberpunk", color: "bg-slate-900" },
    ] as { id: Theme; name: string; color: string }[],
  };
}
