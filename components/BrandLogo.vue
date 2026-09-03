<template>
  <UColorModeImage
    v-if="logo && logoDark"
    :light="logo"
    :dark="logoDark"
    :alt="title"
    :style="{ height: logoHeight }"
    class="w-auto object-contain"
  />
  <img
    v-else-if="logo"
    :src="logo"
    :alt="title"
    :style="{ height: logoHeight }"
    class="w-auto object-contain"
  >
</template>

<script setup lang="ts">
/**
 * The deployment's logo, wherever the brand is shown. Renders nothing when no
 * logo is configured, so the brand name stands on its own; a deployment that
 * ships a dark variant gets it swapped with the color mode.
 */
const { title, logo, logoDark, logoHeight } = useRuntimeConfig().public.theme;
</script>
