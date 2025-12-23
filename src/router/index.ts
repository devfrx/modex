import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import LibraryView from "@/views/LibraryView.vue";
import ModpackView from "@/views/ModpackView.vue";
import OrganizeView from "@/views/OrganizeView.vue";
import SettingsView from "@/views/SettingsView.vue";
import SandboxView from "@/views/SandboxView.vue";
import GuideView from "@/views/GuideView.vue";
import StatsView from "@/views/StatsView.vue";

const routes = [
  { path: "/", redirect: "/home" },
  { path: "/home", component: HomeView },
  { path: "/library", component: LibraryView },
  { path: "/modpacks", component: ModpackView },
  { path: "/organize", component: OrganizeView },
  { path: "/stats", component: StatsView },
  { path: "/sandbox", component: SandboxView },
  { path: "/settings", component: SettingsView },
  { path: "/guide", component: GuideView },
];

// Add dev-only routes
if (import.meta.env.DEV) {
  const DevPlaygroundView = () => import("@/views/DevPlaygroundView.vue");
  routes.push({ path: "/dev", component: DevPlaygroundView });
}

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
