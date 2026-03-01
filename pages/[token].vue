<template>
  <div class="flex min-h-screen flex-col items-center justify-center p-4">
    <div v-if="loading" class="text-center">
      <UIcon name="i-heroicons-arrow-path" class="h-12 w-12 animate-spin text-primary" />
      <p class="mt-4">
        {{ $t('public_loading') }}
      </p>
    </div>
    <div v-else-if="!mediaAccess" class="max-w-md text-center">
      <UIcon name="i-heroicons-exclamation-triangle" class="mx-auto h-16 w-16 text-amber-500" />
      <h1 class="mt-4 text-xl font-semibold">
        {{ $t('public_invalid_token') }}
      </h1>
    </div>
    <div v-else class="w-full max-w-4xl">
      <div
        v-if="mediaAccess.type === 'video' || mediaAccess.type === 'rich'"
        class="relative w-full overflow-hidden rounded-lg bg-black"
        :style="{ paddingBottom: mediaAccess.type === 'video' && mediaAccess.width && mediaAccess.height ? `${(mediaAccess.height / mediaAccess.width) * 100}%` : '56.25%' }"
      >
        <div
          class="absolute inset-0"
          v-html="mediaAccess.html"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

const token = computed(() => route.params.token as string);

const { data: mediaAccess, status: mediaAccessStatus } = useFetch(`/api/access/${encodeURIComponent(token.value)}`);

const loading = computed(() => mediaAccessStatus.value === 'pending');
</script>
