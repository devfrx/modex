import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import router from "./router";
import { createLogger } from "@/utils/logger";

const log = createLogger("App");

// Initialize theme from localStorage before mounting
const savedTheme = localStorage.getItem("modex:theme") || "dark";
if (savedTheme === "system") {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("light", !prefersDark);
} else if (savedTheme === "light") {
  document.documentElement.classList.add("light");
} else {
  document.documentElement.classList.remove("light");
}

// Initialize accent color
const accentColors: Record<string, string> = {
  white: "0 0% 100%",
  purple: "263.4 70% 50.4%",
  blue: "217.2 91.2% 59.8%",
  green: "142.1 76.2% 36.3%",
  red: "0 72.2% 50.6%",
  orange: "24.6 95% 53.1%",
  pink: "330.4 81.2% 60.4%",
};
const savedAccent = localStorage.getItem("modex:accent") || "white";
if (accentColors[savedAccent]) {
  document.documentElement.style.setProperty("--primary", accentColors[savedAccent]);
  // Set primary-foreground based on accent brightness
  if (savedAccent === "white") {
    document.documentElement.style.setProperty("--primary-foreground", "220 13% 10%");
    document.documentElement.setAttribute("data-accent", "white");
  } else {
    document.documentElement.style.setProperty("--primary-foreground", "220 13% 5%");
    document.documentElement.removeAttribute("data-accent");
  }
}

createApp(App)
  .use(router)
  .mount("#app")
  .$nextTick(() => {
    // Hide the loading screen once Vue is mounted
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.classList.add("hidden");
      // Remove from DOM after transition completes
      setTimeout(() => {
        loadingScreen.remove();
      }, 300);
    }
    
    // Use contextBridge
    window.ipcRenderer.on("main-process-message", (_event, message) => {
      log.info(message);
    });
  });
