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
          <!-- Leads to whoever provides this deployment, as a separate icon so
               the brand itself stays plain text. The footer names them again. -->
          <UTooltip v-if="provider.url" :text="visitProvider">
            <UButton
              :to="provider.url"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-heroicons-globe-alt"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="visitProvider"
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
      v-if="loggedIn || provider.url || poweredBy.name"
      class="text-muted flex flex-col items-center gap-1 border-t px-4 py-3 text-sm dark:border-t-gray-800"
    >
      <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <!-- Names whoever runs this deployment, to visitors as well: the branded
             surface is theirs, so the link points at them and not at us. -->
        <template v-if="provider.url">
          <span>{{ t('footer_provider') }}</span>
          <ULink
            :to="provider.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary font-medium"
          >
            {{ providerName }}
          </ULink>
        </template>
        <span v-if="provider.url && poweredBy.name" aria-hidden="true">·</span>
        <!-- Credits whoever built this deployment right next to them. Without
             a URL the credit still shows, just unlinked. -->
        <template v-if="poweredBy.name">
          <span>{{ t('footer_powered_by') }}</span>
          <ULink
            v-if="poweredBy.url"
            :to="poweredBy.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary font-medium"
          >
            {{ poweredBy.name }}
          </ULink>
          <span v-else class="font-medium">{{ poweredBy.name }}</span>
        </template>
      </div>
      <!-- Invites admins to report bugs; a visitor has nothing to report
           upstream and already sees the credit above. -->
      <div v-if="loggedIn" class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
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
const { poweredBy } = useRuntimeConfig().public;
const { title, logo, logoDark, logoHeight, provider } = useRuntimeConfig().public.theme;

const route = useRoute();
const { t } = useI18n();

// A deployment that configures no provider name is still identified by its brand.
const providerName = provider.name || title;
const visitProvider = computed(() => t('header_visit_provider', { name: providerName }));
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
