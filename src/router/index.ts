import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import { defineAsyncComponent } from "vue";
import HomeView from "@/views/HomeView.vue";
import LibraryView from "@/views/LibraryView.vue";
import ModpackView from "@/views/ModpackView.vue";
import ModpackEditorView from "@/views/ModpackEditorView.vue";
import CurseForgeSearchView from "@/views/CurseForgeSearchView.vue";
import CurseForgeModpackSearchView from "@/views/CurseForgeModpackSearchView.vue";
import ModDetailsView from "@/views/ModDetailsView.vue";
import SettingsView from "@/views/SettingsView.vue";
import GuideView from "@/views/GuideView.vue";
import HytaleView from "@/views/HytaleView.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/home" },
  { path: "/home", component: HomeView },
  { path: "/library", component: LibraryView },
  { path: "/library/search", component: CurseForgeSearchView },
  { path: "/library/mod/:id", component: ModDetailsView },
  { path: "/modpacks", component: ModpackView },
  { path: "/modpacks/:id", component: ModpackEditorView },
  { path: "/modpacks/browse", component: CurseForgeModpackSearchView },
  { path: "/settings", component: SettingsView },
  { path: "/guide", component: GuideView },
  // Hytale routes
  { path: "/hytale", component: HytaleView },
  { path: "/hytale/mods", component: defineAsyncComponent(() => import("@/views/HytaleModsView.vue")) },
  { path: "/hytale/modpacks", component: defineAsyncComponent(() => import("@/views/HytaleModpacksView.vue")) },
  { path: "/hytale/browse", component: defineAsyncComponent(() => import("@/views/HytaleBrowseView.vue")) },
  { path: "/hytale/worlds", component: defineAsyncComponent(() => import("@/views/HytaleWorldsView.vue")) },
  { path: "/hytale/modpack/:id", component: defineAsyncComponent(() => import("@/views/HytaleModpackEditorView.vue")) },
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
