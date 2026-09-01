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
          <!-- Leads to the deployment's own site, as a separate icon so the
               brand itself stays plain text. -->
          <UTooltip v-if="url" :text="t('header_website')">
            <UButton
              :to="url"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-heroicons-globe-alt"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('header_website')"
            />
          </UTooltip>
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
    <footer
      class="text-muted flex flex-col items-center gap-1 border-t px-4 py-3 text-sm dark:border-t-gray-800"
    >
      <!-- Names whoever runs this deployment, to visitors as well: the branded
           surface is theirs, so the link points at them and not at us. -->
      <div v-if="provider.url" class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>{{ t('footer_provider') }}</span>
        <ULink
          :to="provider.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary font-medium"
        >
          {{ provider.name || title }}
        </ULink>
      </div>
      <!-- Points admins at the upstream project. Visitors on a token page have
           no session, so the white-label surface stays free of our branding. -->
      <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>{{ t('footer_contrib_question') }}</span>
        <ULink
          :to="repositoryUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary inline-flex items-center gap-1 font-medium"
        >
          <UIcon name="i-simple-icons-github" class="size-4" />
          {{ t('footer_contrib_link') }}
        </ULink>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

/** Upstream project, where admins report bugs and ask questions. */
const repositoryUrl = 'https://github.com/geprog/media-access-manager';

const { loggedIn } = useUserSession();
const { title, url, logo, logoDark, logoHeight, provider } = useRuntimeConfig().public.theme;

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
