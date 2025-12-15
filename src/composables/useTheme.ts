import { ref, watch, computed } from "vue";

export type Theme =
  | "dark"
  | "light"
  | "forest"
  | "ocean"
  | "sunset"
  | "cyberpunk";

export interface ThemeCustomization {
  // Colors
  primaryHue: number;
  primarySaturation: number;
  
  // Borders
  borderRadius: number; // in px
  borderWidth: number; // in px
  
  // Effects
  glassEffect: boolean;
  shadowIntensity: number; // 0-100
  
  // Style preset
  stylePreset: string;
}

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  preview: string; // Color for preview
  config: Partial<ThemeCustomization>;
}

const defaultCustomization: ThemeCustomization = {
  primaryHue: 262,
  primarySaturation: 83,
  borderRadius: 12,
  borderWidth: 1,
  glassEffect: true,
  shadowIntensity: 30,
  stylePreset: "default",
};

export const stylePresets: StylePreset[] = [
  {
    id: "default",
    name: "Default",
    description: "The original ModEx style",
    preview: "#8b5cf6",
    config: {
      primaryHue: 262,
      primarySaturation: 83,
      borderRadius: 12,
      borderWidth: 1,
      glassEffect: true,
      shadowIntensity: 30,
    },
  },
  {
    id: "rounded",
    name: "Rounded",
    description: "Extra rounded corners",
    preview: "#8b5cf6",
    config: {
      borderRadius: 20,
      borderWidth: 1,
      glassEffect: true,
    },
  },
  {
    id: "sharp",
    name: "Sharp",
    description: "Minimal border radius",
    preview: "#8b5cf6",
    config: {
      borderRadius: 4,
      borderWidth: 1,
      glassEffect: false,
    },
  },
  {
    id: "blocky",
    name: "Blocky",
    description: "No rounded corners",
    preview: "#8b5cf6",
    config: {
      borderRadius: 0,
      borderWidth: 2,
      glassEffect: false,
    },
  },
  {
    id: "glass",
    name: "Glassmorphism",
    description: "Heavy glass effect",
    preview: "#8b5cf6",
    config: {
      borderRadius: 16,
      borderWidth: 1,
      glassEffect: true,
      shadowIntensity: 20,
    },
  },
  {
    id: "neon",
    name: "Neon",
    description: "Strong borders and shadows",
    preview: "#00ff88",
    config: {
      primaryHue: 150,
      primarySaturation: 100,
      borderRadius: 8,
      borderWidth: 2,
      glassEffect: false,
      shadowIntensity: 60,
    },
  },
];

const currentTheme = ref<Theme>("dark");
const customization = ref<ThemeCustomization>(loadCustomization());

function loadCustomization(): ThemeCustomization {
  try {
    const saved = localStorage.getItem("modex-theme-customization");
    if (saved) {
      return { ...defaultCustomization, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error("Failed to load theme customization:", e);
  }
  return { ...defaultCustomization };
}

function saveCustomization() {
  try {
    localStorage.setItem("modex-theme-customization", JSON.stringify(customization.value));
  } catch (e) {
    console.error("Failed to save theme customization:", e);
  }
}

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
      setTheme("dark");
    }
    // Apply customization
    applyCustomization();
  }

  function applyCustomization() {
    const root = document.documentElement;
    const config = customization.value;

    // Primary color (HSL)
    root.style.setProperty("--primary-hue", config.primaryHue.toString());
    root.style.setProperty("--primary-sat", `${config.primarySaturation}%`);
    root.style.setProperty(
      "--primary",
      `${config.primaryHue} ${config.primarySaturation}% 65%`
    );

    // Border radius
    root.style.setProperty("--radius", `${config.borderRadius}px`);
    root.style.setProperty("--radius-sm", `${Math.max(0, config.borderRadius - 4)}px`);
    root.style.setProperty("--radius-lg", `${config.borderRadius + 4}px`);
    root.style.setProperty("--radius-xl", `${config.borderRadius + 8}px`);

    // Border width
    root.style.setProperty("--border-width", `${config.borderWidth}px`);

    // Shadow intensity
    const shadowOpacity = config.shadowIntensity / 100;
    root.style.setProperty("--shadow-color", `rgba(0, 0, 0, ${shadowOpacity})`);
    root.style.setProperty(
      "--shadow",
      `0 4px 6px -1px rgba(0, 0, 0, ${shadowOpacity}), 0 2px 4px -2px rgba(0, 0, 0, ${shadowOpacity})`
    );

    // Glass effect
    if (config.glassEffect) {
      root.style.setProperty("--glass-bg", "rgba(255, 255, 255, 0.03)");
      root.style.setProperty("--glass-blur", "12px");
      root.classList.add("glass-enabled");
    } else {
      root.style.setProperty("--glass-bg", "transparent");
      root.style.setProperty("--glass-blur", "0px");
      root.classList.remove("glass-enabled");
    }
  }

  function updateCustomization(updates: Partial<ThemeCustomization>) {
    customization.value = { ...customization.value, ...updates };
    saveCustomization();
    applyCustomization();
  }

  function applyStylePreset(presetId: string) {
    const preset = stylePresets.find((p) => p.id === presetId);
    if (preset) {
      customization.value = {
        ...customization.value,
        ...preset.config,
        stylePreset: presetId,
      };
      saveCustomization();
      applyCustomization();
    }
  }

  function resetCustomization() {
    customization.value = { ...defaultCustomization };
    saveCustomization();
    applyCustomization();
  }

  return {
    currentTheme,
    customization,
    stylePresets,
    setTheme,
    toggleTheme,
    initializeTheme,
    updateCustomization,
    applyStylePreset,
    resetCustomization,
    applyCustomization,
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
