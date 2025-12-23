import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import { defineAsyncComponent } from "vue";
import HomeView from "@/views/HomeView.vue";
import LibraryView from "@/views/LibraryView.vue";
import ModpackView from "@/views/ModpackView.vue";
import OrganizeView from "@/views/OrganizeView.vue";
import SettingsView from "@/views/SettingsView.vue";
import SandboxView from "@/views/SandboxView.vue";
import GuideView from "@/views/GuideView.vue";
import StatsView from "@/views/StatsView.vue";

const routes: RouteRecordRaw[] = [
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
  routes.push({ 
    path: "/dev", 
    component: defineAsyncComponent(() => import("@/views/DevPlaygroundView.vue"))
  });
}

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
