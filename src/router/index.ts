import { createRouter, createWebHashHistory } from "vue-router";
import LibraryView from "@/views/LibraryView.vue";
import ModpackView from "@/views/ModpackView.vue";
import SettingsView from "@/views/SettingsView.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/library" },
    { path: "/library", component: LibraryView },
    { path: "/modpacks", component: ModpackView },
    { path: "/settings", component: SettingsView },
  ],
});

export default router;
