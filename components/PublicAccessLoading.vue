<template>
  <div class="max-w-md text-center">
    <UIcon name="i-heroicons-arrow-path" class="h-12 w-12 animate-spin text-primary" />
    <p class="mt-4">
      {{ message ?? $t('public_loading') }}
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** What is being waited for, when it is more than just the page. */
  message?: string
}>();
</script>
