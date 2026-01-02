<script setup lang="ts">
import { ref } from 'vue';
import Sidebar from "./Sidebar.vue";
import Toast from "@/components/ui/Toast.vue";
import ApiKeyBanner from "@/components/ui/ApiKeyBanner.vue";
import { useToast } from "@/composables/useToast";
import { useSidebar } from "@/composables/useSidebar";
import { Menu } from "lucide-vue-next";

const { messages, remove } = useToast();
const { settings: sidebarSettings } = useSidebar();
const sidebarOpen = ref(false);

function closeSidebar() {
  sidebarOpen.value = false;
}
</script>

<template>
  <div class="flex h-screen bg-background text-foreground"
    :class="sidebarSettings.position === 'right' ? 'flex-row-reverse' : ''">
    <!-- Mobile menu button -->
    <button @click="sidebarOpen = true"
      class="fixed top-2 z-40 sm:hidden p-2 rounded-lg bg-card border border-border shadow-lg"
      :class="sidebarSettings.position === 'right' ? 'right-2' : 'left-2'" aria-label="Open menu">
      <Menu class="w-5 h-5" />
    </button>

    <!-- Mobile overlay -->
    <Transition name="fade">
      <div v-if="sidebarOpen" class="fixed inset-0 bg-black/50 z-40 sm:hidden" @click="closeSidebar" />
    </Transition>

    <!-- Sidebar - hidden on mobile, visible as drawer when open -->
    <div class="fixed sm:relative inset-y-0 z-50 transform transition-transform duration-200 ease-out sm:transform-none"
      :class="[
        sidebarSettings.position === 'right' ? 'right-0' : 'left-0',
        sidebarSettings.position === 'right'
          ? (sidebarOpen ? 'translate-x-0' : 'translate-x-full sm:translate-x-0')
          : (sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0')
      ]">
      <Sidebar :is-open="sidebarOpen" @close="closeSidebar" />
    </div>

    <main class="flex-1 overflow-auto sm:ml-0 flex flex-col">
      <!-- Global API Key Warning Banner -->
      <ApiKeyBanner />
      
      <!-- Main content -->
      <div class="flex-1 overflow-auto">
        <slot />
      </div>
    </main>
    <Toast :messages="messages" @remove="remove" />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
