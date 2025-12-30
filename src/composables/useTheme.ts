import { ref, watch, computed } from "vue";

export type Theme =
  | "dark"
  | "light"
  | "forest"
  | "ocean"
  | "sunset"
  | "cyberpunk"
  | "slate";

export interface ThemeCustomization {
  // Colors
  primaryHue: number; // -10 to 370: -10 to 0 = black, 0-360 = hue, 360-370 = white
  primarySaturation: number;
  primaryLightness: number; // Auto-calculated for normal hues, 0-100 for B/W

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
  primaryHue: 153, // Green/Emerald for Supabase style
  primarySaturation: 60,
  primaryLightness: 55, // Default lightness for normal colors
  borderRadius: 8, // Matches rounded-lg
  borderWidth: 1,
  glassEffect: false,
  shadowIntensity: 20,
  stylePreset: "default",
};

export const stylePresets: StylePreset[] = [
  {
    id: "default",
    name: "Emerald",
    description: "Modern Supabase-inspired green",
    preview: "#3ecf8e",
    config: {
      primaryHue: 153,
      primarySaturation: 60,
      borderRadius: 8,
      borderWidth: 1,
      glassEffect: false,
      shadowIntensity: 20,
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Calm blue tones",
    preview: "#3b82f6",
    config: {
      primaryHue: 217,
      primarySaturation: 91,
      borderRadius: 8,
      borderWidth: 1,
      glassEffect: false,
      shadowIntensity: 20,
    },
  },
  {
    id: "violet",
    name: "Violet",
    description: "Rich purple accents",
    preview: "#8b5cf6",
    config: {
      primaryHue: 262,
      primarySaturation: 83,
      borderRadius: 8,
      borderWidth: 1,
      glassEffect: false,
      shadowIntensity: 20,
    },
  },
  {
    id: "rose",
    name: "Rose",
    description: "Warm pink tones",
    preview: "#f43f5e",
    config: {
      primaryHue: 350,
      primarySaturation: 89,
      borderRadius: 8,
      borderWidth: 1,
      glassEffect: false,
      shadowIntensity: 20,
    },
  },
  {
    id: "amber",
    name: "Amber",
    description: "Warm orange glow",
    preview: "#f59e0b",
    config: {
      primaryHue: 38,
      primarySaturation: 92,
      borderRadius: 8,
      borderWidth: 1,
      glassEffect: false,
      shadowIntensity: 20,
    },
  },
  {
    id: "neon",
    name: "Neon",
    description: "Vibrant cyberpunk style",
    preview: "#00ff88",
    config: {
      primaryHue: 150,
      primarySaturation: 100,
      borderRadius: 6,
      borderWidth: 2,
      glassEffect: false,
      shadowIntensity: 50,
    },
  },
  {
    id: "glass",
    name: "Glass",
    description: "Frosted glassmorphism",
    preview: "#3ecf8e",
    config: {
      primaryHue: 153,
      primarySaturation: 60,
      borderRadius: 12,
      borderWidth: 1,
      glassEffect: true,
      shadowIntensity: 15,
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean monochrome look",
    preview: "#a1a1aa",
    config: {
      primaryHue: 240,
      primarySaturation: 5,
      borderRadius: 6,
      borderWidth: 1,
      glassEffect: false,
      shadowIntensity: 10,
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
    localStorage.setItem(
      "modex-theme-customization",
      JSON.stringify(customization.value)
    );
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

    // Primary color (HSL) - handle extended range for black/white
    // Range: -10 to 0 = black, 0-360 = hue colors, 360-370 = white
    let hue = config.primaryHue;
    let sat = config.primarySaturation;
    let lightness = config.primaryLightness || 55;

    if (hue < 0) {
      // Black range: -10 to 0 maps to lightness 0% to 10%
      const blackProgress = (hue + 10) / 10; // 0 to 1
      hue = 0;
      sat = 0;
      lightness = blackProgress * 10; // 0% to 10%
    } else if (hue > 360) {
      // White range: 360 to 370 maps to lightness 90% to 100%
      const whiteProgress = (hue - 360) / 10; // 0 to 1
      hue = 0;
      sat = 0;
      lightness = 90 + whiteProgress * 10; // 90% to 100%
    } else {
      // Normal hue range - use user's lightness (defaults to 55)
      lightness = config.primaryLightness || 55;
    }

    // Primary color (HSL) - only apply if not using a preset theme's color
    // or if explicitly customized (different from default)
    const isCustomColor =
      config.primaryHue !== 262 || config.primarySaturation !== 83;
    if (isCustomColor || currentTheme.value === "dark") {
      root.style.setProperty("--primary-hue", hue.toString());
      root.style.setProperty("--primary-sat", `${sat}%`);
      root.style.setProperty("--primary", `${hue} ${sat}% ${lightness}%`);
      root.style.setProperty("--ring", `${hue} ${sat}% ${lightness}%`);
    }

    // Border radius
    root.style.setProperty("--radius", `${config.borderRadius}px`);

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
      { id: "slate", name: "Slate", color: "bg-slate-600" },
      { id: "forest", name: "Forest", color: "bg-emerald-950" },
      { id: "ocean", name: "Ocean", color: "bg-blue-950" },
      { id: "sunset", name: "Sunset", color: "bg-orange-950" },
      { id: "cyberpunk", name: "Cyberpunk", color: "bg-slate-900" },
    ] as { id: Theme; name: string; color: string }[],
  };
}
