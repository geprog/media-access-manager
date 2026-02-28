<template>
  <div class="flex min-h-screen flex-col items-center justify-center p-4">
    <div v-if="loading" class="text-center">
      <UIcon name="i-heroicons-arrow-path" class="h-12 w-12 animate-spin text-primary" />
      <p class="mt-4">
        {{ $t('public_loading') }}
      </p>
    </div>
    <div v-else-if="!valid" class="max-w-md text-center">
      <UIcon name="i-heroicons-exclamation-triangle" class="mx-auto h-16 w-16 text-amber-500" />
      <h1 class="mt-4 text-xl font-semibold">
        {{ $t('public_invalid_token') }}
      </h1>
    </div>
    <div v-else-if="embed" class="w-full max-w-4xl">
      <header class="mb-6 flex items-center justify-center gap-4">
        <img
          v-if="theme.companyLogo"
          :src="theme.companyLogo"
          :alt="theme.companyName"
          class="h-10 object-contain"
        >
        <span class="text-lg font-semibold">{{ theme.companyName }}</span>
      </header>
      <div
        v-if="embed.type === 'video' || embed.type === 'rich'"
        class="relative w-full overflow-hidden rounded-lg bg-black"
        :style="{ paddingBottom: embed.type === 'video' && embed.width && embed.height ? `${(embed.height / embed.width) * 100}%` : '56.25%' }"
      >
        <div
          class="absolute inset-0"
          v-html="(embed as { html: string }).html"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

const token = computed(() => route.params.token as string);
const loading = ref(true);
const valid = ref(false);
const embed = ref<{ type: string, html?: string, width?: number, height?: number } | null>(null);
const theme = ref({ companyLogo: '', companyName: '' });

definePageMeta({
  layout: false,
});

onMounted(async () => {
  if (!token.value || token.value === 'login' || token.value === 'media') {
    valid.value = false;
    loading.value = false;
    return;
  }
  try {
    const [result, themeData] = await Promise.all([
      $fetch<{ valid: boolean, embed?: unknown }>(`/api/access/${encodeURIComponent(token.value)}`),
      $fetch<{ companyLogo: string, companyName: string }>('/api/theme'),
    ]);
    theme.value = themeData;
    valid.value = result.valid;
    if (result.valid && result.embed) {
      embed.value = result.embed as { type: string, html?: string, width?: number, height?: number };
    }
  }
  catch {
    valid.value = false;
  }
  finally {
    loading.value = false;
  }
});
</script>
