<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-semibold">
            {{ t('accessibility_title') }}
          </h2>
          <MediaAccessibilityBadge v-if="accessibility" :status="accessibility.report.status" />
        </div>
        <div class="flex items-center gap-3">
          <span v-if="accessibility" class="text-sm text-muted">
            {{ t('accessibility_checked_at', { time: formatTime(accessibility.checkedAt) }) }}
          </span>
          <!-- Straight to the media at the provider, so a reported issue can be
               fixed without searching for it there first. -->
          <UButton
            v-if="accessibility?.providerUrl"
            variant="outline"
            color="neutral"
            size="sm"
            icon="i-heroicons-arrow-top-right-on-square"
            :to="accessibility.providerUrl"
            target="_blank"
            :label="t('accessibility_open_at_provider')"
          />
          <UButton
            variant="outline"
            size="sm"
            icon="i-heroicons-arrow-path"
            :loading="pending"
            :label="t('accessibility_recheck')"
            @click="recheck"
          />
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <p v-if="accessibility?.report.status === 'ok'" class="text-sm">
        {{ t('accessibility_ok_hint') }}
      </p>
      <UAlert
        v-for="issue in accessibility?.report.issues ?? []"
        :key="issue.code"
        :color="issue.severity === 'error' ? 'error' : 'warning'"
        variant="subtle"
        :icon="issue.severity === 'error' ? 'i-heroicons-x-circle' : 'i-heroicons-exclamation-triangle'"
        :description="t(`accessibility_issue_${issue.code}`, issue.details ?? {})"
      />

      <UCollapsible v-if="instructionKeys.length > 0" v-model:open="showInstructions">
        <UButton
          variant="link"
          class="p-0"
          :icon="showInstructions ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
          :label="t('accessibility_setup_title')"
        />
        <template #content>
          <ol class="mt-2 list-decimal space-y-1 pl-6 text-sm text-muted">
            <li v-for="key in instructionKeys" :key="key">
              {{ t(key) }}
            </li>
          </ol>
        </template>
      </UCollapsible>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { AccessibilityReport } from '~/server/services/providers/types';

const props = defineProps<{ mediaId: string, providerId?: string }>();

const { t, locale } = useI18n();

interface MediaAccessibility {
  mediaId: string
  report: AccessibilityReport
  checkedAt: string
  providerUrl: string | null
}

const accessibility = ref<MediaAccessibility | null>(null);
const instructionKeys = ref<string[]>([]);
const pending = ref(false);

// Failures are what an admin needs to act on, so only those open the checklist.
const showInstructions = ref(false);

async function load(refresh = false) {
  pending.value = true;
  try {
    accessibility.value = await $fetch<MediaAccessibility>(
      `/api/media/${props.mediaId}/accessibility`,
      { query: refresh ? { refresh: '1' } : undefined },
    );
    showInstructions.value = accessibility.value.report.status === 'error';
  }
  finally {
    pending.value = false;
  }
}

async function loadInstructions() {
  if (!props.providerId) {
    instructionKeys.value = [];
    return;
  }
  const setup = await $fetch<{ instructionKeys: string[] }>(
    `/api/providers/${props.providerId}/setup-instructions`,
  );
  instructionKeys.value = setup.instructionKeys;
}

watch(() => props.mediaId, () => load(), { immediate: true });
watch(() => props.providerId, () => loadInstructions(), { immediate: true });

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(locale.value);
}

function recheck() {
  return load(true);
}
</script>
