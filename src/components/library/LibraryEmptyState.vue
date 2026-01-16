<script setup lang="ts">
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import { useRouter } from "vue-router";

const router = useRouter();

function browseMods() {
  router.push("/library/search");
}
</script>

<template>
  <div class="flex items-center justify-center flex-1 bg-background">
    <div class="text-center max-w-sm flex flex-col items-center">
      <div class="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-6">
        <Icon name="Package" class="w-8 h-8 text-muted-foreground" />
      </div>

      <h3 class="text-xl font-bold mb-2">Your library is empty</h3>
      <p class="text-muted-foreground mb-6 text-sm max-w-xs mx-auto leading-relaxed">
        Browse CurseForge to discover and add mods.
      </p>

      <Button @click="browseMods" size="lg"
        class="gap-2.5 h-11 px-6 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
        <Icon name="Globe" class="w-5 h-5" />
        <span class="font-semibold">Browse Mods</span>
      </Button>
    </div>
  </div>
</template>
