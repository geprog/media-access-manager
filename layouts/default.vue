<template>
  <div class="flex min-h-screen flex-col">
    <UNavigationMenu :items="items" :ui="{ root: 'px-2 border-b dark:border-b-gray-800' }">
      <template #list-leading>
        <div class="flex items-center gap-2">
          <img
            v-if="logo"
            :src="logo"
            :alt="title"
            class="h-8 object-contain"
          >
          <span class="text-lg font-semibold">
            {{ title }}
          </span>
        </div>
      </template>
    </UNavigationMenu>
    <main class="flex-1 p-4">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

const { loggedIn } = useUserSession();
const { title, logo } = useRuntimeConfig().public;

const route = useRoute();
const { t } = useI18n();
const path = computed(() => route.path);

// Visitors on a public token page have no admin session, so the layout shows
// nothing but the branding for them.
const items = computed<NavigationMenuItem[]>(() => (loggedIn.value
  ? [
      [
        {
          label: t('media_list_title'),
          icon: 'i-heroicons-home',
          to: '/',
          active: path.value.startsWith('/'),
        },
      ],
      [
        {
          label: t('logout'),
          icon: 'i-heroicons-arrow-right-on-rectangle',
          to: '/auth/logout/',
        },
      ],
    ]
  : []));
</script>
