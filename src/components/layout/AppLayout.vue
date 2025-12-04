<script setup lang="ts">
import Sidebar from "./Sidebar.vue";
import Toast from "@/components/ui/Toast.vue";
import { useToast } from "@/composables/useToast";

const { messages, remove } = useToast();
</script>

<template>
  <div class="flex h-screen bg-background text-foreground">
    <Sidebar />
    <main class="flex-1 overflow-auto">
      <slot />
    </main>
    <Toast :messages="messages" @remove="remove" />
  </div>
</template>
