<template>
  <UBadge
    :color="color"
    :icon="icon"
    variant="subtle"
    :label="$t(`accessibility_status_${status}`)"
  />
</template>

<script setup lang="ts">
type AccessibilityStatus = 'ok' | 'warning' | 'error' | 'unknown';

const props = defineProps<{ status: AccessibilityStatus }>();

const APPEARANCE = {
  ok: { color: 'success', icon: 'i-heroicons-check-circle' },
  warning: { color: 'warning', icon: 'i-heroicons-exclamation-triangle' },
  error: { color: 'error', icon: 'i-heroicons-x-circle' },
  unknown: { color: 'neutral', icon: 'i-heroicons-question-mark-circle' },
} as const;

const color = computed(() => APPEARANCE[props.status].color);
const icon = computed(() => APPEARANCE[props.status].icon);
</script>
