<template>
  <!-- Closing mid-request would look like cancelling a deletion that still goes through. -->
  <UModal v-model:open="open" :title="title" :dismissible="!pending">
    <template #body>
      <form :id="formId" class="space-y-4" @submit.prevent="confirmDelete">
        <div class="space-y-2">
          <p>{{ message }}</p>
          <p class="text-sm text-muted">
            {{ hint }}
          </p>
        </div>
        <UFormField :label="t('delete_confirm_type_name', { name: confirmText })">
          <UInput
            v-model="typedText"
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
          :disabled="!textMatches"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { matchesDeleteConfirmation } from '~/utils/deleteConfirmation';

/**
 * Asks before deleting something for good, and only lets the admin go ahead
 * once they typed its name (or for a token, its value): a slip of the mouse
 * must not take a batch of tokens already handed out with it.
 */
const props = defineProps<{
  title: string
  message: string
  hint: string
  /** What the admin has to type to unlock the delete button. */
  confirmText: string
  confirmLabel: string
  /** Runs the deletion; the dialog closes once it succeeded. */
  action: () => Promise<unknown>
}>();

const open = defineModel<boolean>('open', { required: true });

const { t } = useI18n();
const toast = useToast();

const formId = useId();
const typedText = ref('');
const pending = ref(false);
const textMatches = computed(() => matchesDeleteConfirmation(typedText.value, props.confirmText));

// Each opening starts empty, so text typed for one deletion cannot confirm the next.
watch(open, (isOpen) => {
  if (isOpen)
    typedText.value = '';
});

async function confirmDelete() {
  if (!textMatches.value || pending.value)
    return;
  pending.value = true;
  try {
    await props.action();
    open.value = false;
  }
  catch {
    // E.g. deleted in another tab meanwhile, or the session ran out.
    toast.add({ title: t('delete_failed'), color: 'error' });
  }
  finally {
    pending.value = false;
  }
}
</script>
