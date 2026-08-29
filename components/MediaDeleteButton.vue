<template>
  <UButton
    color="error"
    variant="ghost"
    size="sm"
    icon="i-heroicons-trash"
    :label="t('media_delete')"
    @click="open = true"
  />

  <UModal v-model:open="open" :title="t('media_delete_title')">
    <template #body>
      <div class="space-y-2">
        <p>{{ t('media_delete_confirm', { title }) }}</p>
        <p class="text-sm text-muted">
          {{ t('media_delete_confirm_hint') }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          variant="outline"
          :label="t('cancel')"
          :disabled="pending"
          @click="open = false"
        />
        <UButton
          color="error"
          :label="t('media_delete')"
          :loading="pending"
          @click="confirmDelete"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{ mediaId: string, title: string }>();
const emit = defineEmits<{ deleted: [] }>();

const { t } = useI18n();
const toast = useToast();

const open = ref(false);
const pending = ref(false);

async function confirmDelete() {
  pending.value = true;
  try {
    await $fetch(`/api/media/${props.mediaId}`, { method: 'DELETE' });
    open.value = false;
    toast.add({ title: t('media_deleted', { title: props.title }), color: 'success' });
    emit('deleted');
  }
  finally {
    pending.value = false;
  }
}
</script>
