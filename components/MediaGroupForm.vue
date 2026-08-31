<template>
  <UForm class="flex flex-col gap-6" @submit.prevent="handleSubmit">
    <UFormField :label="$t('group_name')">
      <UInput v-model="name" required :placeholder="$t('group_name_placeholder')" />
    </UFormField>
    <UFormField :label="$t('group_media')" :hint="hint">
      <USelectMenu
        v-model="mediaIds"
        class="w-full"
        multiple
        value-key="value"
        :aria-label="$t('group_media')"
        :items="items"
        :loading="status === 'pending'"
        :placeholder="$t('group_media_placeholder')"
        :search-input="{ placeholder: $t('media_video_search_placeholder') }"
      />
    </UFormField>
    <div class="flex justify-end gap-2">
      <UButton variant="outline" :label="$t('cancel')" @click="emit('cancel')" />
      <UButton type="submit" :label="submitLabel" :disabled="!canSubmit" :loading="pending" />
    </div>
  </UForm>
</template>

<script setup lang="ts">
const props = defineProps<{
  submitLabel: string
  name?: string
  mediaIds?: string[]
  pending?: boolean
}>();

const emit = defineEmits<{
  submit: [value: { name: string, mediaIds: string[] }]
  cancel: []
}>();

const { t } = useI18n();

const name = ref(props.name ?? '');
const mediaIds = ref<string[]>([...(props.mediaIds ?? [])]);

const { data: media, status } = useFetch('/api/media', { default: () => [] });

const items = computed(() => media.value.map(row => ({ label: row.title, value: row.id })));

const hint = computed(() =>
  status.value !== 'pending' && items.value.length === 0 ? t('group_media_none') : undefined,
);

// A group without media would hand out tokens leading to an empty list.
const canSubmit = computed(() => !!name.value.trim() && mediaIds.value.length > 0);

function handleSubmit() {
  if (!canSubmit.value) {
    return;
  }
  emit('submit', { name: name.value.trim(), mediaIds: [...mediaIds.value] });
}
</script>
