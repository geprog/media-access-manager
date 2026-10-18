<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <form :id="formId" class="space-y-4" @submit.prevent="confirmDelete">
        <div class="space-y-2">
          <p>{{ message }}</p>
          <p class="text-sm text-muted">
            {{ hint }}
          </p>
        </div>
        <UFormField :label="t('delete_confirm_type_name', { name: confirmName })">
          <UInput
            v-model="typedName"
            class="w-full"
            autocomplete="off"
          />
        </UFormField>
      </form>
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
          type="submit"
          :form="formId"
          color="error"
          :label="confirmLabel"
          :loading="pending"
          :disabled="!nameMatches"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
/**
 * Asks before deleting something for good, and only lets the admin go ahead
 * once they typed its name: a slip of the mouse must not take a batch of
 * tokens already handed out with it.
 */
const props = defineProps<{
  title: string
  message: string
  hint: string
  /** What the admin has to type to unlock the delete button. */
  confirmName: string
  confirmLabel: string
  /** Runs the deletion; the dialog closes once it succeeded. */
  action: () => Promise<unknown>
}>();

const open = defineModel<boolean>('open', { required: true });

const { t } = useI18n();

const formId = useId();
const typedName = ref('');
const pending = ref(false);
const nameMatches = computed(() => typedName.value.trim() === props.confirmName.trim());

// Each opening starts empty, so a name typed for one deletion cannot confirm the next.
watch(open, (isOpen) => {
  if (isOpen)
    typedName.value = '';
});

async function confirmDelete() {
  if (!nameMatches.value || pending.value)
    return;
  pending.value = true;
  try {
    await props.action();
    open.value = false;
  }
  finally {
    pending.value = false;
  }
}
</script>
