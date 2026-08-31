<template>
  <div class="flex min-h-screen flex-col">
    <UNavigationMenu :items="items" :ui="{ root: 'px-2 border-b dark:border-b-gray-800' }">
      <template #list-leading>
        <div class="flex items-center gap-2">
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
          <span class="text-lg font-semibold">
            {{ title }}
          </span>
          <!-- Tells admins which app the branded UI belongs to. Visitors on a
               token page have no session, so they never see it. -->
          <UBadge
            v-if="loggedIn"
            color="neutral"
            variant="subtle"
            :label="t('admin_ui_hint')"
          />
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
const { title, logo, logoDark, logoHeight } = useRuntimeConfig().public.theme;

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
          icon: 'i-heroicons-film',
          to: '/',
          // Only the media list itself, so opening a group does not light up
          // both entries at once.
          active: path.value === '/' || path.value.startsWith('/media'),
        },
        {
          label: t('groups_title'),
          icon: 'i-heroicons-rectangle-stack',
          to: '/groups',
          active: path.value.startsWith('/groups'),
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
