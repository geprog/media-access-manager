<template>
  <footer class="text-muted flex flex-col items-center gap-1 border-t px-4 py-3 text-sm dark:border-t-gray-800">
    <div
      v-if="publisher.url || poweredBy.name"
      class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
    >
      <!-- Names whoever publishes the media here, to visitors as well: the
           branded surface is theirs, so the link points at them, not at us. -->
      <template v-if="publisher.url">
        <span>{{ t('footer_publisher') }}</span>
        <ULink
          :to="publisher.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary font-medium"
        >
          {{ publisherName }}
        </ULink>
      </template>
      <span v-if="publisher.url && poweredBy.name" aria-hidden="true">·</span>
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
    <!-- Invites admins to report bugs. Points at the upstream project rather
         than at the deployment, so it stands on its own when neither a
         publisher nor a credit is configured. -->
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
</template>

<script setup lang="ts">
/** Upstream project, where admins report bugs and ask questions. */
const repositoryUrl = 'https://github.com/geprog/media-access-manager';

const { publisher, poweredBy } = useRuntimeConfig().public;
const { title } = useRuntimeConfig().public.theme;
const { t } = useI18n();

// A deployment that names no publisher is still identified by its brand.
const publisherName = publisher.name || title;
</script>
