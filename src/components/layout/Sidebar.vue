<script setup lang="ts">
import { RouterLink } from "vue-router";
import { Library, Package, Settings } from "lucide-vue-next";
import { cn } from "@/lib/utils";
</script>

<template>
  <div class="h-screen w-64 bg-card border-r flex flex-col">
    <div class="p-6 border-b">
      <h1 class="text-xl font-bold tracking-tight">ModEx</h1>
    </div>
    <nav class="flex-1 p-4 space-y-2">
      <RouterLink
        to="/library"
        class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        active-class="bg-accent text-accent-foreground"
      >
        <Library class="w-5 h-5" />
        Library
      </RouterLink>
      <RouterLink
        to="/modpacks"
        class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        active-class="bg-accent text-accent-foreground"
      >
        <Package class="w-5 h-5" />
        Modpacks
      </RouterLink>
    </nav>
    <div class="p-4 border-t">
      <RouterLink
        to="/settings"
        class="flex items-center gap-3 px-3 py-2 w-full rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        active-class="bg-accent text-accent-foreground"
      >
        <Settings class="w-5 h-5" />
        Settings
      </RouterLink>
    </div>
  </div>
</template>
